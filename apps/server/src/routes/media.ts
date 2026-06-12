import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { and, count, desc, eq, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromFile } from 'file-type';
import type { UploadResponse } from '@tmw/shared';
import { db } from '../db/index';
import { bans, channels, submissions, users, whitelist, type SubmissionRow } from '../db/schema';
import { config } from '../config';
import { probeDurationMs, trimTo } from '../media/ffmpeg';
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

export function registerMediaRoutes(app: FastifyInstance, deps: MediaRoutesDeps): void {
  const { playback, storage, tmpDir, io } = deps;

  app.post<{ Params: { login: string } }>('/api/c/:login/upload', async (req, reply) => {
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
        return reply.code(429).send({ error: `Слишком часто — подожди ещё ${waitS} с` });
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

    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: 'Файл не передан (multipart-поле file)' });
    }

    const id = crypto.randomUUID();
    const uploadTmp = path.join(tmpDir, `${id}.upload`);

    try {
      await pipeline(file.file, createWriteStream(uploadTmp));
      if (file.file.truncated) {
        return reply.code(413).send({
          error: `Файл больше лимита ${Math.round(config.maxFileSizeBytes / 1024 / 1024)} МБ`,
        });
      }
      // Глобальный лимит проверяет multipart, лимит канала — по факту.
      const { size } = await fsp.stat(uploadTmp);
      if (size > channel.maxFileSizeBytes) {
        return reply.code(413).send({
          error: `Файл больше лимита канала ${Math.round(channel.maxFileSizeBytes / 1024 / 1024)} МБ`,
        });
      }

      // Тип определяем по magic bytes, расширению и mime из запроса не доверяем.
      const detected = await fileTypeFromFile(uploadTmp);
      const kind = detected ? config.allowedMime[detected.mime] : undefined;
      if (!detected || !kind) {
        return reply.code(415).send({
          error: `Неподдерживаемый тип файла${detected ? ` (${detected.mime})` : ''}`,
        });
      }

      let durationMs: number;
      let finalTmp = uploadTmp;

      if (kind === 'image') {
        durationMs = Math.min(config.imageDurationMs, channel.maxDurationMs);
      } else {
        const probed = await probeDurationMs(uploadTmp);
        if (probed === null) {
          return reply.code(422).send({ error: 'Не удалось прочитать медиафайл (битый?)' });
        }
        if (probed > channel.maxDurationMs) {
          const trimmed = path.join(tmpDir, `${id}.${detected.ext}`);
          await trimTo(uploadTmp, trimmed, channel.maxDurationMs);
          await fsp.rm(uploadTmp, { force: true });
          finalTmp = trimmed;
          durationMs = channel.maxDurationMs;
        } else {
          durationMs = probed;
        }
      }

      const filePath = `${channel.id}/${id}.${detected.ext}`;
      await storage.putFile(filePath, finalTmp);

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
        originalName: file.filename ?? 'unknown',
        filePath,
        mime: detected.mime,
        kind,
        durationMs,
        status: whitelisted ? 'approved' : 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(submissions).values(row);

      let queuePosition = 0;
      if (row.status === 'approved') {
        queuePosition = playback.enqueue(row);
      } else {
        io.to(dashboardRoomOf(channel.id)).emit('moderation:new', toSummary(row));
      }

      const response: UploadResponse = { id, status: row.status, durationMs, queuePosition };
      return reply.code(201).send(response);
    } finally {
      await fsp.rm(uploadTmp, { force: true });
    }
  });

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
}
