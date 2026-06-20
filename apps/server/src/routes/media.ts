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
  probeDurationMs,
  processImage,
  transcodeAudio,
  transcodeVideo,
} from '../media/process';
import { parseYoutube, validateYoutube } from '../media/youtube';
import { requireUser } from '../auth';
import {
  dashboardRoomOf,
  toSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';
import type { Storage } from '../storage';

export interface MediaRoutesDeps {
  playback: PlaybackManager;
  storage: Storage;
  tmpDir: string;
  io: RealtimeServer;
}

/** Начислить звёздную пыль пользователю (атомарный инкремент). */
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
      // Жёсткий HTTP-лимит поверх кулдаунов: транскодирование — дорогая операция.
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

    // Владелец канала шлёт без ограничений: это «тестовая отправка» из дашборда.
    const isOwner = channel.ownerUserId === user.id;

    if (!channel.accepting && !isOwner) {
      return reply.code(403).send({ error: 'Стример приостановил приём отправок' });
    }

    if (!isOwner) {
      // Бан — молчаливое отклонение: ответ неотличим от «ушло на модерацию»,
      // но файл не обрабатывается и никуда не попадает.
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
          // Кулдаун как у обычного зрителя — ответ неотличим от настоящей отправки.
          cooldownSec: Math.round(config.moderation.viewerCooldownMs / 1000),
          // Бан не начисляет пыль — возвращаем текущий баланс (ответ неотличим от настоящего).
          stardustBalance: user.stardust,
        };
        return reply.code(201).send(fake);
      }

      // Кулдаун зрителя в этом канале.
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

      // Часовой лимит канала.
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
      // Принимаем необязательный файл + необязательное текстовое поле в одном multipart.
      let hasFile = false;
      let truncated = false;
      let originalName = 'unknown';
      let text: string | undefined;
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (hasFile) {
            // Лишние файлы игнорируем, но поток обязательно дочитываем, иначе запрос зависнет.
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

      // Полный текст нужен, чтобы распознать YouTube-ссылку ДО обрезки (иначе длинная
      // подпись перед ссылкой могла бы её отрезать); подпись же обрезаем до лимита.
      const fullText = text?.trim() || undefined;
      text = fullText?.slice(0, TEXT_MAX_LEN) || undefined;

      // Должно быть хоть что-то: файл или текст.
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
        // Глобальный лимит проверяет multipart, лимит канала — по факту.
        const { size } = await fsp.stat(uploadTmp);
        if (size > channel.maxFileSizeBytes) {
          return reply.code(413).send({
            error: `Файл больше лимита канала ${Math.round(channel.maxFileSizeBytes / 1024 / 1024)} МБ`,
          });
        }

        // Тип определяем по magic bytes, расширению и mime из запроса не доверяем.
        const detected = await fileTypeFromFile(uploadTmp);
        const detectedKind = detected ? config.allowedMime[detected.mime] : undefined;
        if (!detected || !detectedKind) {
          return reply.code(415).send({
            error: `Неподдерживаемый тип файла${detected ? ` (${detected.mime})` : ''}`,
          });
        }
        kind = detectedKind;

        // Фаза 5: всё перекодируется в предсказуемые форматы (webp/mp4/mp3) —
        // обрезка, отрезание экзотических кодеков и метаданных одним проходом.
        let outExt: string;
        try {
          if (kind === 'image') {
            durationMs = Math.min(config.imageDurationMs, channel.maxDurationMs);
            outExt = 'webp';
            outMime = 'image/webp';
            await processImage(uploadTmp, path.join(tmpDir, `${id}.${outExt}`));
          } else {
            const probed = await probeDurationMs(uploadTmp);
            if (probed === null) {
              return reply.code(422).send({ error: 'Не удалось прочитать медиафайл (битый?)' });
            }
            // У аудио свой, более длинный лимит — музыке нужно больше 60 с.
            const limit = kind === 'audio' ? channel.maxAudioDurationMs : channel.maxDurationMs;
            durationMs = Math.min(probed, limit);
            if (kind === 'video') {
              outExt = 'mp4';
              outMime = 'video/mp4';
              await transcodeVideo(uploadTmp, path.join(tmpDir, `${id}.${outExt}`), durationMs);
            } else {
              outExt = 'mp3';
              outMime = 'audio/mpeg';
              await transcodeAudio(uploadTmp, path.join(tmpDir, `${id}.${outExt}`), durationMs);
            }
          }
        } catch (err) {
          req.log.warn({ err, submissionId: id }, 'media processing failed');
          return reply.code(422).send({ error: 'Не удалось обработать медиафайл' });
        }

        const finalTmp = path.join(tmpDir, `${id}.${outExt}`);
        filePath = `${channel.id}/${id}.${outExt}`;
        await storage.putFile(filePath, finalTmp);
      } else {
        const yt = parseYoutube(fullText!);
        if (yt) {
          // YouTube-ссылка: ничего не качаем и не транскодируем — играет встроенный плеер.
          const meta = await validateYoutube(yt.videoId);
          if (!meta) {
            return reply
              .code(422)
              .send({ error: 'Не удалось открыть видео с YouTube (приватное/удалённое?)' });
          }
          kind = 'youtube';
          // music.youtube.com → помечаем как музыку (оверлей покажет компактным плеером).
          outMime = yt.isMusic ? 'audio/youtube' : 'video/youtube';
          youtubeId = yt.videoId;
          youtubeStart = yt.startSeconds;
          // Длительность заранее неизвестна (играем до конца) — оверлей сообщит реальную.
          durationMs = 0;
          // Подпись: остаток текста без ссылки, иначе название ролика (обрезаем до лимита).
          text = (yt.caption ?? (meta.title || undefined))?.slice(0, TEXT_MAX_LEN) || undefined;
        } else {
          // Текст-онли: без транскода. Длительность показа — по «времени чтения»,
          // но не дольше 15 с (хватает даже на 280 символов). Если озвучка длиннее —
          // она доиграет уже без текста на экране.
          kind = 'text';
          outMime = 'text/plain';
          durationMs = Math.min(15_000, Math.max(4000, 4000 + 60 * text!.length));
        }
      }

      // Гибридная модерация: владелец и белый список → сразу на экран, остальные → pending.
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

      // Звёздная пыль: +1 отправителю и +1 владельцу за входящую отправку (даже неопубликованную).
      // За свои же тест-отправки владельцу НЕ начисляем (анти-селф-фарм).
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
        io.to(dashboardRoomOf(channel.id)).emit('moderation:new', toSummary(row));
      }

      const response: UploadResponse = {
        id,
        status: row.status,
        durationMs,
        queuePosition,
        // Владелец шлёт без кулдауна (тестовая отправка) → 0; зрителю — окно канала.
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
    const sub = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, req.params.id))
      .get();
    if (!sub || !sub.filePath) {
      return reply.code(404).send({ error: 'Не найдено' });
    }
    // Локальная реализация: отдаём с диска через @fastify/static (root = storage.root).
    return reply.type(sub.mime).sendFile(sub.filePath);
  });

  // Озвучка имени отправителя или текста сообщения. Web Speech API в OBS не работает
  // (нет голосов), поэтому проксируем готовый mp3 от Google Translate TTS (бесплатно, без ключа).
  // Текст берём из БД по id отправки — клиент произвольный текст не передаёт.
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
    // Кириллица → русское произношение, иначе английское (или env-override).
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
  });
}
