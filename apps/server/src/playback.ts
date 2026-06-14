import { eq } from 'drizzle-orm';
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
import { channels, submissions, type SubmissionRow } from './db/schema';
import { config } from './config';

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
      // Текст-онли не имеет файла (filePath=null) — для него отсутствие файла нормально.
      if (!fresh || fresh.status !== 'approved' || (!fresh.filePath && fresh.kind !== 'text'))
        continue;
      // Пока ходили в БД, другой вызов tryNext мог занять слот.
      if (st.current) {
        st.queue.unshift(candidate);
        return;
      }

      st.current = fresh;
      this.io.to(roomOf(channelId)).emit('media:play', await this.buildPayload(fresh));
      this.io.to(dashboardRoomOf(channelId)).emit('playback:started', toSummary(fresh));
      emitSubmissionStatus(this.io, fresh.id, 'playing');
      st.watchdog = setTimeout(
        () => void this.onDone(channelId, fresh.id),
        fresh.durationMs + config.watchdogGraceMs,
      );
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
      ...resolveLayout(sub.kind, channel),
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
): Pick<MediaPlayPayload, 'position' | 'size' | 'margin'> {
  if (!channel) return { position: 'center', size: 80, margin: 0 };
  const useMusic = kind === 'audio' && channel.musicSeparate;
  return useMusic
    ? { position: channel.musicPosition, size: channel.musicSize, margin: channel.musicMargin }
    : { position: channel.overlayPosition, size: channel.overlaySize, margin: channel.overlayMargin };
}

export function setupRealtime(io: RealtimeServer): PlaybackManager {
  const playback = new PlaybackManager(io);

  io.on('connection', (socket) => {
    void (async () => {
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

      // И оверлей (OBS Browser Source не умеет OAuth), и дашборд
      // аутентифицируются секретным токеном канала.
      const { token } = socket.handshake.query;
      if (
        (role !== 'overlay' && role !== 'dashboard') ||
        typeof token !== 'string' ||
        token.length === 0
      ) {
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

      if (role === 'dashboard') {
        void socket.join(dashboardRoomOf(channel.id));
        return;
      }

      void socket.join(roomOf(channel.id));
      socket.on('playback:done', (submissionId) => {
        if (typeof submissionId === 'string') void playback.onDone(channel.id, submissionId);
      });
      void playback.onOverlayConnected(channel.id, (payload) =>
        socket.emit('media:play', payload),
      );
    })();
  });

  return playback;
}
