import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type {
  LiveStatus,
  MediaPlayPayload,
  OverlayToServerEvents,
  ServerToDashboardEvents,
  ServerToOverlayEvents,
  ServerToViewerEvents,
  SubmissionSummary,
} from '@tmw/shared';
import { db } from './db/index';
import { channelModerators, channels, submissions, type SubmissionRow } from './db/schema';
import { config } from './config';
import { getUserFromCookieHeader } from './auth';
// Только тип — чтобы не создавать runtime-цикл (gateway импортирует roomOf отсюда).
import type { DonationGateway } from './donations/gateway';

export type RealtimeServer = Server<
  OverlayToServerEvents,
  ServerToOverlayEvents & ServerToDashboardEvents & ServerToViewerEvents
>;

export function roomOf(channelId: string): string {
  return `channel:${channelId}`;
}

/** Комната дашборда стримера: live-события модерации и показа. */
export function dashboardRoomOf(channelId: string): string {
  return `dashboard:${channelId}`;
}

/** Комната одной отправки: живой статус для страницы зрителя. */
export function submissionRoomOf(submissionId: string): string {
  return `submission:${submissionId}`;
}

/** Отправить живой статус зрителю, который ждёт судьбу своей отправки. */
export function emitSubmissionStatus(
  io: RealtimeServer,
  submissionId: string,
  status: LiveStatus,
): void {
  io.to(submissionRoomOf(submissionId)).emit('submission:status', { submissionId, status });
}

/** Краткая карточка отправки для дашборда. */
export function toSummary(sub: SubmissionRow): SubmissionSummary {
  return {
    id: sub.id,
    senderUserId: sub.senderUserId,
    senderName: sub.senderName,
    kind: sub.kind,
    mime: sub.mime,
    text: sub.text,
    durationMs: sub.durationMs,
    createdAt: sub.createdAt.getTime(),
    url: `/api/media/${sub.id}`,
    youtubeId: sub.youtubeId,
  };
}

interface ChannelState {
  queue: SubmissionRow[];
  current: SubmissionRow | null;
  watchdog: NodeJS.Timeout | null;
}

/**
 * Очередь показа per-channel. Проигрывание строго по одному:
 * следующий элемент уходит в оверлей только после playback:done
 * (или по watchdog-таймеру, если оверлей умер посреди показа).
 */
export class PlaybackManager {
  private states = new Map<string, ChannelState>();

  constructor(private io: RealtimeServer) {}

  /** Возвращает позицию в очереди (1 = следующий). */
  enqueue(sub: SubmissionRow): number {
    const st = this.state(sub.channelId);
    st.queue.push(sub);
    const position = st.queue.length + (st.current ? 1 : 0);
    void this.tryNext(sub.channelId);
    return position;
  }

  /** При старте сервера возвращаем в очередь всё, что не успело проиграться. */
  async recoverFromDb(): Promise<void> {
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.status, 'approved'))
      .all();
    for (const row of rows) {
      this.state(row.channelId).queue.push(row);
    }
  }

  getCurrent(channelId: string): SubmissionRow | null {
    return this.state(channelId).current;
  }

  /** Скип текущего показа стримером. true, если что-то играло. */
  async skip(channelId: string): Promise<boolean> {
    const current = this.state(channelId).current;
    if (!current) return false;
    // Оверлей получит media:skip и погасит экран; onDone продвинет очередь
    // независимо от того, жив ли оверлей.
    this.io.to(roomOf(channelId)).emit('media:skip', current.id);
    await this.onDone(channelId, current.id);
    return true;
  }

  async onOverlayConnected(
    channelId: string,
    replayTo: (payload: MediaPlayPayload) => void,
  ): Promise<void> {
    const st = this.state(channelId);
    if (st.current) {
      // Оверлей переподключился посреди показа — переигрываем текущий элемент.
      replayTo(await this.buildPayload(st.current));
    } else {
      void this.tryNext(channelId);
    }
  }

  async onDone(channelId: string, submissionId: string): Promise<void> {
    const st = this.state(channelId);
    if (st.current?.id !== submissionId) return;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = null;
    st.current = null;

    await db
      .update(submissions)
      .set({ status: 'played', updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));

    // Гасим отставшие копии оверлея (несколько открытых вкладок и т.п.).
    this.io.to(roomOf(channelId)).emit('media:skip', submissionId);
    this.io.to(dashboardRoomOf(channelId)).emit('playback:ended', submissionId);
    emitSubmissionStatus(this.io, submissionId, 'played');
    void this.tryNext(channelId);
  }

  /** Оверлей сообщил реальную длительность текущего ролика (YouTube). Перенастраиваем watchdog. */
  reportDuration(channelId: string, submissionId: string, durationMs: number): void {
    const st = this.state(channelId);
    // Оверлей за overlayToken (полу-доверенный) — клампим значение: мусор/огромное число
    // иначе зарядило бы watchdog на сутки. Сверх лимита остаётся щадящий watchdog из tryNext.
    if (
      st.current?.id !== submissionId ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      durationMs > 12 * 60 * 60 * 1000
    )
      return;
    st.current.durationMs = durationMs;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = setTimeout(
      () => void this.onDone(channelId, submissionId),
      durationMs + config.watchdogGraceMs,
    );
    // Панель «сейчас играет» получает реальное время вместо нулевого.
    this.io.to(dashboardRoomOf(channelId)).emit('playback:started', toSummary(st.current));
  }

  private async tryNext(channelId: string): Promise<void> {
    const st = this.state(channelId);
    if (st.current || st.queue.length === 0 || this.overlayCount(channelId) === 0) return;

    while (st.queue.length > 0) {
      const candidate = st.queue.shift()!;
      // Статус мог измениться, пока элемент ждал в памяти (например, протух).
      const fresh = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, candidate.id))
        .get();
      // Текст и YouTube не имеют файла на диске (filePath=null) — для них это норма.
      const fileless = fresh?.kind === 'text' || fresh?.kind === 'youtube';
      if (!fresh || fresh.status !== 'approved' || (!fresh.filePath && !fileless)) continue;
      // Пока ходили в БД, другой вызов tryNext мог занять слот.
      if (st.current) {
        st.queue.unshift(candidate);
        return;
      }

      st.current = fresh;
      this.io.to(roomOf(channelId)).emit('media:play', await this.buildPayload(fresh));
      this.io.to(dashboardRoomOf(channelId)).emit('playback:started', toSummary(fresh));
      emitSubmissionStatus(this.io, fresh.id, 'playing');
      // YouTube: длительность узнаём только при проигрывании (см. reportDuration),
      // поэтому до её получения держим щадящий watchdog вместо durationMs (=0).
      const watchdogMs =
        fresh.kind === 'youtube'
          ? config.youtube.loadGraceMs
          : fresh.durationMs + config.watchdogGraceMs;
      st.watchdog = setTimeout(() => void this.onDone(channelId, fresh.id), watchdogMs);
      return;
    }
  }

  private overlayCount(channelId: string): number {
    return this.io.sockets.adapter.rooms.get(roomOf(channelId))?.size ?? 0;
  }

  private async buildPayload(sub: SubmissionRow): Promise<MediaPlayPayload> {
    const channel = await db
      .select({
        volume: channels.volume,
        showSenderName: channels.showSenderName,
        soundAlert: channels.soundAlert,
        ttsName: channels.ttsName,
        ttsMessage: channels.ttsMessage,
        overlayPosition: channels.overlayPosition,
        overlaySize: channels.overlaySize,
        overlayMargin: channels.overlayMargin,
        musicSeparate: channels.musicSeparate,
        musicPosition: channels.musicPosition,
        musicSize: channels.musicSize,
        musicMargin: channels.musicMargin,
      })
      .from(channels)
      .where(eq(channels.id, sub.channelId))
      .get();
    const showName = channel?.showSenderName ?? true;
    return {
      submissionId: sub.id,
      url: `/api/media/${sub.id}`,
      kind: sub.kind,
      durationMs: sub.durationMs,
      volume: channel?.volume ?? 100,
      sound: channel?.soundAlert ?? false,
      // TTS озвучивает имя — без показа имени оно тоже не имеет смысла.
      tts: (channel?.ttsName ?? false) && showName && sub.senderName !== null,
      senderName: showName ? (sub.senderName ?? undefined) : undefined,
      text: sub.text ?? undefined,
      ttsText: (channel?.ttsMessage ?? false) && !!sub.text,
      // У музыки может быть своя раскладка; сервер сам выбирает нужную по типу медиа,
      // поэтому оверлею всё равно — он просто применяет position/size/margin из payload.
      ...resolveLayout(sub.kind, channel, sub.mime === 'audio/youtube'),
      youtubeId: sub.youtubeId ?? undefined,
      youtubeStartSeconds: sub.youtubeStart,
      youtubeMusic: sub.mime === 'audio/youtube',
    };
  }

  private state(channelId: string): ChannelState {
    let st = this.states.get(channelId);
    if (!st) {
      st = { queue: [], current: null, watchdog: null };
      this.states.set(channelId, st);
    }
    return st;
  }
}

/** Какую раскладку показать для данного типа медиа: общую (overlay*) или музыкальную (music*). */
function resolveLayout(
  kind: SubmissionRow['kind'],
  channel: {
    overlayPosition: MediaPlayPayload['position'];
    overlaySize: number;
    overlayMargin: number;
    musicSeparate: boolean;
    musicPosition: MediaPlayPayload['position'];
    musicSize: number;
    musicMargin: number;
  } | null | undefined,
  isMusic = false,
): Pick<MediaPlayPayload, 'position' | 'size' | 'margin'> {
  if (!channel) return { position: 'center', size: 80, margin: 0 };
  // YouTube Music идёт по музыкальной раскладке наравне с аудиофайлами.
  const useMusic = (kind === 'audio' || isMusic) && channel.musicSeparate;
  return useMusic
    ? { position: channel.musicPosition, size: channel.musicSize, margin: channel.musicMargin }
    : { position: channel.overlayPosition, size: channel.overlaySize, margin: channel.overlayMargin };
}

export function setupRealtime(
  io: RealtimeServer,
  app: FastifyInstance,
  donations: DonationGateway,
): PlaybackManager {
  const playback = new PlaybackManager(io);

  io.on('connection', (socket) => {
    void (async () => {
      try {
      const { role } = socket.handshake.query;

      // Зритель следит за судьбой своей отправки. Аутентификация не нужна:
      // id отправки — случайный UUID, знание его и есть пропуск в комнату.
      if (role === 'viewer') {
        const submissionId = socket.handshake.query.submission;
        if (typeof submissionId !== 'string' || !submissionId) {
          socket.disconnect(true);
          return;
        }
        void socket.join(submissionRoomOf(submissionId));
        // Текущий статус сразу — на случай, если показ уже случился до подписки.
        const sub = await db
          .select({ status: submissions.status, channelId: submissions.channelId })
          .from(submissions)
          .where(eq(submissions.id, submissionId))
          .get();
        if (sub) {
          const playing = playback.getCurrent(sub.channelId)?.id === submissionId;
          socket.emit('submission:status', {
            submissionId,
            status: playing ? 'playing' : sub.status,
          });
        }
        return;
      }

      // Дашборд: авторизация по сессионной куке (модератору overlayToken не даём).
      // Членство в канале = владелец ИЛИ строка в channel_moderators.
      if (role === 'dashboard') {
        const { channelId } = socket.handshake.query;
        if (typeof channelId !== 'string' || !channelId) {
          socket.disconnect(true);
          return;
        }
        const user = await getUserFromCookieHeader(
          socket.handshake.headers.cookie,
          (v) => app.unsignCookie(v),
        );
        if (!user) {
          socket.disconnect(true);
          return;
        }
        const channel = await db
          .select({ ownerUserId: channels.ownerUserId })
          .from(channels)
          .where(eq(channels.id, channelId))
          .get();
        if (!channel) {
          socket.disconnect(true);
          return;
        }
        if (channel.ownerUserId !== user.id) {
          const mod = await db
            .select({ userId: channelModerators.userId })
            .from(channelModerators)
            .where(
              and(
                eq(channelModerators.channelId, channelId),
                eq(channelModerators.userId, user.id),
              ),
            )
            .get();
          if (!mod) {
            socket.disconnect(true);
            return;
          }
        }
        void socket.join(dashboardRoomOf(channelId));
        return;
      }

      // Оверлей (OBS Browser Source не умеет OAuth) — секретный токен канала.
      if (role === 'overlay') {
        const { token } = socket.handshake.query;
        if (typeof token !== 'string' || token.length === 0) {
          socket.disconnect(true);
          return;
        }
        const channel = await db
          .select({ id: channels.id })
          .from(channels)
          .where(eq(channels.overlayToken, token))
          .get();
        if (!channel) {
          socket.disconnect(true);
          return;
        }
        void socket.join(roomOf(channel.id));
        // Оверлей подключён = «стрим идёт» → запускаем поллинг донатов; отключился → гасим.
        void donations.onOverlayConnected(channel.id);
        socket.on('disconnect', () => donations.onOverlayMaybeGone(channel.id));
        socket.on('playback:done', (submissionId) => {
          if (typeof submissionId === 'string') void playback.onDone(channel.id, submissionId);
        });
        socket.on('playback:duration', (submissionId, durationMs) => {
          if (typeof submissionId === 'string' && typeof durationMs === 'number') {
            playback.reportDuration(channel.id, submissionId, durationMs);
          }
        });
        void playback.onOverlayConnected(channel.id, (payload) =>
          socket.emit('media:play', payload),
        );
        return;
      }

      // Неизвестная роль.
      socket.disconnect(true);
      } catch (err) {
        app.log.error({ err }, 'socket connection handler failed');
        socket.disconnect(true);
      }
    })();
  });

  return playback;
}
