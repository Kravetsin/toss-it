import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/index';
import { channelIntegrations } from '../db/schema';
import { decryptSecret } from '../crypto';
import { roomOf, type RealtimeServer } from '../playback';
import { donatelloAdapter } from './donatello';
import { toFx, type DonationAdapter } from './types';

const ADAPTERS: Record<string, DonationAdapter> = { donatello: donatelloAdapter };
const POLL_INTERVAL_MS = 4000;

interface ChannelPoll {
  provider: string;
  adapter: DonationAdapter;
  token: string;
  lastSeenId: string | null;
  timer: NodeJS.Timeout;
  busy: boolean;
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
    private log: Pick<FastifyBaseLogger, 'error'>,
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
      busy: false,
      timer: setInterval(() => void this.tick(channelId), POLL_INTERVAL_MS),
    });
  }

  private stop(channelId: string): void {
    const poll = this.polls.get(channelId);
    if (!poll) return;
    clearInterval(poll.timer);
    this.polls.delete(channelId);
  }

  private async tick(channelId: string): Promise<void> {
    const poll = this.polls.get(channelId);
    if (!poll || poll.busy) return;
    poll.busy = true;
    try {
      const events = await poll.adapter.fetchRecent(poll.token); // старые → новые
      if (events.length === 0) return;
      const newestId = events[events.length - 1]!.id;

      // Первый опрос после старта: запоминаем «верх» как базовую линию, ничего не выстреливаем.
      if (poll.lastSeenId === null) {
        poll.lastSeenId = newestId;
        await this.persist(channelId, poll.provider, newestId);
        return;
      }

      // Курсор найден → выстреливаем всё после него; не найден (выпал из окна) → не флудим.
      const idx = events.findIndex((e) => e.id === poll.lastSeenId);
      const fresh = idx >= 0 ? events.slice(idx + 1) : [];
      for (const e of fresh) {
        this.io.to(roomOf(channelId)).emit('donation:fx', toFx(poll.provider, e));
      }
      if (newestId !== poll.lastSeenId) {
        poll.lastSeenId = newestId;
        await this.persist(channelId, poll.provider, newestId);
      }
    } catch (err) {
      this.log.error({ err, channelId }, 'donation poll failed');
    } finally {
      poll.busy = false;
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
