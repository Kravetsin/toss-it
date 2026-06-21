import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromFile } from 'file-type';
import { TEXT_MAX_LEN, type MediaKind, type UploadResponse } from '@tmw/shared';
import { db } from '../db/index';
import { bans, channels, submissions, users, whitelist, type SubmissionRow } from '../db/schema';
import { config } from '../config';
import {
  MediaQueueFullError,
  probeMedia,
  processImage,
  transcodeAudio,
  transcodeVideo,
} from '../media/process';
import { parseYoutube, validateYoutube } from '../media/youtube';
import { requireUser } from '../auth';
import { dashboardRoomOf, toSummary, type PlaybackManager, type RealtimeServer } from '../playback';
import type { Storage } from '../storage';

export interface MediaRoutesDeps {
  playback: PlaybackManager;
  storage: Storage;
  tmpDir: string;
  io: RealtimeServer;
}

/** Atomic increment of a user's stardust balance. */
async function addStardust(userId: string, n: number): Promise<void> {
  await db
    .update(users)
    .set({ stardust: sql`${users.stardust} + ${n}` })
    .where(eq(users.id, userId));
}

export function registerMediaRoutes(app: FastifyInstance, deps: MediaRoutesDeps): void {
  const { playback, storage, tmpDir, io } = deps;

  app.post<{ Params: { login: string } }>(
    '/api/c/:login/upload',
    {
      // Hard HTTP limit on top of cooldowns: transcoding is expensive.
      config: {
        rateLimit: { max: config.rateLimit.upload, timeWindow: '1 minute' },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return;

      const found = await db
        .select({ ch: channels })
        .from(channels)
        .innerJoin(users, eq(users.id, channels.ownerUserId))
        .where(eq(users.login, req.params.login.toLowerCase()))
        .get();
      if (!found) return reply.code(404).send({ error: 'Канал не найден' });
      const channel = found.ch;

      // Channel owner bypasses limits: this is a dashboard "test send".
      const isOwner = channel.ownerUserId === user.id;

      if (!channel.accepting && !isOwner) {
        return reply.code(403).send({ error: 'Стример приостановил приём отправок' });
      }

      if (!isOwner) {
        // Ban = silent reject: response is indistinguishable from "sent to
        // moderation", but the file is never processed or stored.
        const banned = await db
          .select()
          .from(bans)
          .where(and(eq(bans.channelId, channel.id), eq(bans.userId, user.id)))
          .get();
        if (banned) {
          const fake: UploadResponse = {
            id: crypto.randomUUID(),
            status: 'pending',
            durationMs: 0,
            queuePosition: 0,
            // Normal viewer cooldown to keep response indistinguishable.
            cooldownSec: Math.round(config.moderation.viewerCooldownMs / 1000),
            // Ban grants no stardust; return current balance for indistinguishability.
            stardustBalance: user.stardust,
          };
          return reply.code(201).send(fake);
        }

        const last = await db
          .select({ createdAt: submissions.createdAt })
          .from(submissions)
          .where(and(eq(submissions.channelId, channel.id), eq(submissions.senderUserId, user.id)))
          .orderBy(desc(submissions.createdAt))
          .get();
        if (last && Date.now() - last.createdAt.getTime() < config.moderation.viewerCooldownMs) {
          const waitS = Math.ceil(
            (config.moderation.viewerCooldownMs - (Date.now() - last.createdAt.getTime())) / 1000,
          );
          return reply.code(429).send({
            error: `Слишком часто — подожди ещё ${waitS} с`,
            code: 'cooldown',
            retryAfterSec: waitS,
          });
        }

        const hourly = await db
          .select({ n: count() })
          .from(submissions)
          .where(
            and(
              eq(submissions.channelId, channel.id),
              gt(submissions.createdAt, new Date(Date.now() - 3_600_000)),
            ),
          )
          .get();
        if ((hourly?.n ?? 0) >= config.moderation.channelHourlyLimit) {
          return reply.code(429).send({ error: 'Канал получил слишком много отправок за час' });
        }
      }

      const id = crypto.randomUUID();
      const uploadTmp = path.join(tmpDir, `${id}.upload`);

      try {
        let hasFile = false;
        let truncated = false;
        let originalName = 'unknown';
        let text: string | undefined;
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            if (hasFile) {
              // Ignore extra files, but must drain the stream or the request hangs.
              part.file.resume();
              continue;
            }
            hasFile = true;
            originalName = part.filename || 'unknown';
            await pipeline(part.file, createWriteStream(uploadTmp));
            truncated = part.file.truncated;
          } else if (part.fieldname === 'text' && typeof part.value === 'string') {
            text = part.value;
          }
        }

        // Keep full text to detect a YouTube link BEFORE truncating (a long
        // caption before the link could otherwise cut it off); caption is clipped.
        const fullText = text?.trim() || undefined;
        text = fullText?.slice(0, TEXT_MAX_LEN) || undefined;

        if (!hasFile && !text) {
          return reply.code(400).send({ error: 'Пустая отправка: нужен файл или текст' });
        }
        if (hasFile && truncated) {
          return reply.code(413).send({
            error: `Файл больше лимита ${Math.round(config.maxFileSizeBytes / 1024 / 1024)} МБ`,
          });
        }

        let kind: MediaKind;
        let durationMs: number;
        let filePath: string | null = null;
        let outMime: string;
        let youtubeId: string | null = null;
        let youtubeStart = 0;

        if (hasFile) {
          // Global limit is enforced by multipart; per-channel limit checked here.
          const { size } = await fsp.stat(uploadTmp);
          if (size > channel.maxFileSizeBytes) {
            return reply.code(413).send({
              error: `Файл больше лимита канала ${Math.round(channel.maxFileSizeBytes / 1024 / 1024)} МБ`,
            });
          }

          // Detect type by magic bytes; don't trust extension or request mime.
          const detected = await fileTypeFromFile(uploadTmp);
          const detectedKind = detected ? config.allowedMime[detected.mime] : undefined;
          if (!detected || !detectedKind) {
            return reply.code(415).send({
              error: `Неподдерживаемый тип файла${detected ? ` (${detected.mime})` : ''}`,
            });
          }
          kind = detectedKind;

          // Re-encode everything to predictable formats (webp/mp4/mp3): one pass
          // trims duration and strips exotic codecs and metadata.
          let outExt: string;
          try {
            if (kind === 'image') {
              durationMs = Math.min(config.imageDurationMs, channel.maxDurationMs);
              outExt = 'webp';
              outMime = 'image/webp';
              await processImage(uploadTmp, path.join(tmpDir, `${id}.${outExt}`));
            } else {
              const info = await probeMedia(uploadTmp);
              if (info === null) {
                return reply.code(422).send({ error: 'Не удалось прочитать медиафайл (битый?)' });
              }
              // Audio has its own longer limit; music needs more than 60s.
              const limit = kind === 'audio' ? channel.maxAudioDurationMs : channel.maxDurationMs;
              durationMs = Math.min(info.durationMs, limit);
              if (kind === 'video') {
                outExt = 'mp4';
                outMime = 'video/mp4';
                await transcodeVideo(
                  uploadTmp,
                  path.join(tmpDir, `${id}.${outExt}`),
                  durationMs,
                  info,
                );
              } else {
                outExt = 'mp3';
                outMime = 'audio/mpeg';
                await transcodeAudio(
                  uploadTmp,
                  path.join(tmpDir, `${id}.${outExt}`),
                  durationMs,
                  info,
                );
              }
            }
          } catch (err) {
            if (err instanceof MediaQueueFullError) {
              return reply.code(503).send({
                error: 'Сервер сейчас перегружен обработкой медиа — попробуй через минуту',
                retryAfterSec: 30,
              });
            }
            req.log.warn({ err, submissionId: id }, 'media processing failed');
            return reply.code(422).send({ error: 'Не удалось обработать медиафайл' });
          }

          const finalTmp = path.join(tmpDir, `${id}.${outExt}`);
          filePath = `${channel.id}/${id}.${outExt}`;
          await storage.putFile(filePath, finalTmp);
        } else {
          const yt = parseYoutube(fullText!);
          if (yt) {
            // YouTube link: nothing downloaded or transcoded; embedded player plays it.
            const meta = await validateYoutube(yt.videoId);
            if (!meta) {
              return reply
                .code(422)
                .send({ error: 'Не удалось открыть видео с YouTube (приватное/удалённое?)' });
            }
            kind = 'youtube';
            // music.youtube.com → mark as music (overlay shows a compact player).
            outMime = yt.isMusic ? 'audio/youtube' : 'video/youtube';
            youtubeId = yt.videoId;
            youtubeStart = yt.startSeconds;
            // Duration unknown ahead of time (plays to end); overlay reports real value.
            durationMs = 0;
            // Caption: leftover text minus the link, else the video title (clipped).
            text = (yt.caption ?? (meta.title || undefined))?.slice(0, TEXT_MAX_LEN) || undefined;
          } else {
            // Text-only: no transcode. Display time scales with reading time but
            // caps at 15s (enough for 280 chars); longer TTS finishes off-screen.
            kind = 'text';
            outMime = 'text/plain';
            durationMs = Math.min(15_000, Math.max(4000, 4000 + 60 * text!.length));
          }
        }

        // Hybrid moderation: owner and whitelist go straight to screen, rest pending.
        const whitelisted = isOwner
          ? true
          : (await db
              .select()
              .from(whitelist)
              .where(and(eq(whitelist.channelId, channel.id), eq(whitelist.userId, user.id)))
              .get()) !== undefined;

        const now = new Date();
        const row: SubmissionRow = {
          id,
          channelId: channel.id,
          senderUserId: user.id,
          senderName: user.displayName,
          originalName,
          filePath,
          text: text ?? null,
          mime: outMime,
          kind,
          durationMs,
          status: whitelisted ? 'approved' : 'pending',
          createdAt: now,
          updatedAt: now,
          youtubeId,
          youtubeStart,
        };
        await db.insert(submissions).values(row);

        // Stardust: +1 sender and +1 owner per incoming send (even unpublished).
        // Owner's own test sends earn nothing (anti self-farm).
        let stardustBalance = user.stardust;
        if (!isOwner) {
          await addStardust(user.id, 1);
          await addStardust(channel.ownerUserId, 1);
          stardustBalance = user.stardust + 1;
        }

        let queuePosition = 0;
        if (row.status === 'approved') {
          queuePosition = playback.enqueue(row);
        } else {
          io.to(dashboardRoomOf(channel.id)).emit(
            'moderation:new',
            toSummary(row, {
              color: user.equipped?.nickColor ?? null,
              nickEffect: user.equipped?.nickEffect ?? null,
              cardEffect: user.equipped?.cardEffect ?? null,
            }),
          );
        }

        const response: UploadResponse = {
          id,
          status: row.status,
          durationMs,
          queuePosition,
          // Owner has no cooldown (test send) → 0; viewer gets the channel window.
          cooldownSec: isOwner ? 0 : Math.round(config.moderation.viewerCooldownMs / 1000),
          stardustBalance,
        };
        return reply.code(201).send(response);
      } finally {
        await fsp.rm(uploadTmp, { force: true });
      }
    },
  );

  app.get<{ Params: { id: string } }>('/api/media/:id', async (req, reply) => {
    const sub = await db.select().from(submissions).where(eq(submissions.id, req.params.id)).get();
    if (!sub || !sub.filePath) {
      return reply.code(404).send({ error: 'Не найдено' });
    }
    // Local impl: served from disk via @fastify/static (root = storage.root).
    return reply.type(sub.mime).sendFile(sub.filePath);
  });

  // TTS of sender name or message. Web Speech API has no voices in OBS, so we
  // proxy a ready mp3 from Google Translate TTS (free, keyless). Text comes from
  // DB by submission id; clients never pass arbitrary text.
  app.get<{ Params: { id: string }; Querystring: { part?: string } }>(
    '/api/tts/:id',
    async (req, reply) => {
      const sub = await db
        .select({ senderName: submissions.senderName, message: submissions.text })
        .from(submissions)
        .where(eq(submissions.id, req.params.id))
        .get();
      const source = req.query.part === 'message' ? sub?.message : sub?.senderName;
      if (!source) return reply.code(404).send({ error: 'Не найдено' });

      const text = source.slice(0, 180);
      // Cyrillic → Russian pronunciation, else English (or env override).
      const lang = config.tts.lang ?? (/[Ѐ-ӿ]/i.test(text) ? 'ru' : 'en');
      const url =
        `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
        `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
        if (!res.ok) return reply.code(502).send({ error: 'TTS upstream error' });
        const buf = Buffer.from(await res.arrayBuffer());
        return reply.type('audio/mpeg').send(buf);
      } catch (err) {
        req.log.warn({ err }, 'tts proxy failed');
        return reply.code(502).send({ error: 'TTS upstream error' });
      }
    },
  );
}
