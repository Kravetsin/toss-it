import type { DonationFx } from '@tmw/shared';

/** HTTP-ошибка провайдера — несёт статус и Retry-After (для backoff на 429). */
export class DonationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'DonationHttpError';
  }
}

/** Нормализованный донат от любого провайдера. */
export interface DonationEvent {
  /** Стабильный id доната у провайдера (для дедупа/курсора). */
  id: string;
  /** Метка времени (мс) — для сортировки в хронологический порядок. */
  at: number;
  donorName: string | null;
  amount: number;
  currency: string;
  message: string | null;
}

/** Адаптер донат-провайдера. Деньги через нас не идут — только чтение событий. */
export interface DonationAdapter {
  readonly provider: string;
  /** Проверить токен и вернуть имя аккаунта (для «Подключено как X»). Бросает при невалидном. */
  validate(token: string): Promise<{ name: string | null }>;
  /** Недавние донаты в хронологическом порядке (старые → новые), отфильтрованные. */
  fetchRecent(token: string): Promise<DonationEvent[]>;
}

/** DonationEvent → DonationFx (полезная нагрузка для оверлея). */
export function toFx(provider: string, e: DonationEvent): DonationFx {
  return {
    provider,
    donorName: e.donorName,
    amount: e.amount,
    currency: e.currency,
    message: e.message,
  };
}
