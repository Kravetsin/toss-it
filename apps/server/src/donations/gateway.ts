import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/index';
import { channelIntegrations } from '../db/schema';
import { decryptSecret } from '../crypto';
import { roomOf, type RealtimeServer } from '../playback';
import { donatelloAdapter } from './donatello';
import { DonationHttpError, toFx, type DonationAdapter } from './types';

const ADAPTERS: Record<string, DonationAdapter> = { donatello: donatelloAdapter };
/** Базовый интервал опроса. Провайдеры рейт-лимитят историю донатов → не чаще. */
const BASE_INTERVAL_MS = 10_000;
/** Потолок экспоненциального backoff при 429. */
const MAX_BACKOFF_MS = 120_000;

interface ChannelPoll {
  provider: string;
  adapter: DonationAdapter;
  token: string;
  lastSeenId: string | null;
  timer: NodeJS.Timeout | null;
  /** Текущая задержка до следующего опроса (растёт при 429, сбрасывается при успехе). */
  backoffMs: number;
  busy: boolean;
  stopped: boolean;
}

/**
 * Держит per-channel поллинг донат-провайдеров. Жизненный цикл привязан к присутствию
 * оверлея в комнате канала (наш платформонезависимый «live»-сигнал): поллим только пока
 * стример вещает. Новый донат → эмит `donation:fx` в overlay-комнату. Дедуп по id доната.
 */
export class DonationGateway {
  private polls = new Map<string, ChannelPoll>();

  constructor(
    private io: RealtimeServer,
    private log: Pick<FastifyBaseLogger, 'error' | 'info' | 'warn'>,
  ) {}

  /** Оверлей канала подключился → запускаем поллинг, если есть интеграция. */
  async onOverlayConnected(channelId: string): Promise<void> {
    if (this.polls.has(channelId)) return;
    await this.start(channelId);
  }

  /** Сокет оверлея отключился → если в комнате больше никого, гасим поллинг. */
  onOverlayMaybeGone(channelId: string): void {
    if (this.roomEmpty(channelId)) this.stop(channelId);
  }

  /** Интеграцию подключили/отключили — перезапуск, если оверлей сейчас онлайн. */
  async refresh(channelId: string): Promise<void> {
    this.stop(channelId);
    if (!this.roomEmpty(channelId)) await this.start(channelId);
  }

  /** Останавливает все поллеры (graceful shutdown). */
  stopAll(): void {
    for (const id of [...this.polls.keys()]) this.stop(id);
  }

  private roomEmpty(channelId: string): boolean {
    return (this.io.sockets.adapter.rooms.get(roomOf(channelId))?.size ?? 0) === 0;
  }

  private async start(channelId: string): Promise<void> {
    const row = await db
      .select()
      .from(channelIntegrations)
      .where(eq(channelIntegrations.channelId, channelId))
      .get();
    if (!row) return;
    const adapter = ADAPTERS[row.provider];
    if (!adapter) return;
    let token: string;
    try {
      token = decryptSecret(row.encToken);
    } catch (err) {
      this.log.error({ err, channelId }, 'donation: failed to decrypt token');
      return;
    }
    this.polls.set(channelId, {
      provider: row.provider,
      adapter,
      token,
      lastSeenId: row.lastDonationId,
      backoffMs: BASE_INTERVAL_MS,
      busy: false,
      stopped: false,
      timer: null,
    });
    this.log.info(
      { channelId, provider: row.provider, lastSeenId: row.lastDonationId },
      'donation: poller started',
    );
    this.schedule(channelId, 1000); // первый опрос почти сразу
  }

  /** Запланировать следующий опрос (самопланирующийся цикл — задержка переменная из-за backoff). */
  private schedule(channelId: string, delayMs: number): void {
    const poll = this.polls.get(channelId);
    if (!poll || poll.stopped) return;
    poll.timer = setTimeout(() => void this.tick(channelId), delayMs);
  }

  private stop(channelId: string): void {
    const poll = this.polls.get(channelId);
    if (!poll) return;
    poll.stopped = true;
    if (poll.timer) clearTimeout(poll.timer);
    this.polls.delete(channelId);
    this.log.info({ channelId }, 'donation: poller stopped');
  }

  private async tick(channelId: string): Promise<void> {
    const poll = this.polls.get(channelId);
    if (!poll || poll.busy || poll.stopped) return;
    poll.busy = true;
    let nextDelay = BASE_INTERVAL_MS;
    try {
      const events = await poll.adapter.fetchRecent(poll.token); // старые → новые
      poll.backoffMs = BASE_INTERVAL_MS; // успех → сбрасываем backoff
      if (events.length === 0) return;
      const newestId = events[events.length - 1]!.id;

      // Первый опрос после старта: запоминаем «верх» как базовую линию, ничего не выстреливаем.
      if (poll.lastSeenId === null) {
        poll.lastSeenId = newestId;
        await this.persist(channelId, poll.provider, newestId);
        this.log.info({ channelId, newestId, count: events.length }, 'donation: baseline set');
        return;
      }

      // Курсор найден → выстреливаем всё после него; не найден (выпал из окна) → не флудим.
      const idx = events.findIndex((e) => e.id === poll.lastSeenId);
      if (idx < 0) {
        this.log.warn(
          { channelId, lastSeenId: poll.lastSeenId, count: events.length },
          'donation: cursor not found in window, advancing without emit',
        );
      }
      const fresh = idx >= 0 ? events.slice(idx + 1) : [];
      for (const e of fresh) {
        this.io.to(roomOf(channelId)).emit('donation:fx', toFx(poll.provider, e));
      }
      if (fresh.length > 0) {
        this.log.info({ channelId, count: fresh.length }, 'donation: fx emitted');
      }
      if (newestId !== poll.lastSeenId) {
        poll.lastSeenId = newestId;
        await this.persist(channelId, poll.provider, newestId);
      }
    } catch (err) {
      if (err instanceof DonationHttpError && err.status === 429) {
        // Рейт-лимит: отступаем (уважая Retry-After), экспоненциально до потолка.
        poll.backoffMs = Math.min(err.retryAfterMs ?? poll.backoffMs * 2, MAX_BACKOFF_MS);
        nextDelay = poll.backoffMs;
        this.log.warn(
          { channelId, nextDelayMs: nextDelay },
          'donation: rate limited (429), backing off',
        );
      } else {
        this.log.error({ err, channelId }, 'donation poll failed');
      }
    } finally {
      poll.busy = false;
      this.schedule(channelId, nextDelay);
    }
  }

  private async persist(channelId: string, provider: string, lastDonationId: string): Promise<void> {
    await db
      .update(channelIntegrations)
      .set({ lastDonationId, updatedAt: new Date() })
      .where(
        and(
          eq(channelIntegrations.channelId, channelId),
          eq(channelIntegrations.provider, provider),
        ),
      );
  }
}
