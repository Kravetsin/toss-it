import type { DonationAdapter, DonationEvent } from './types';

/**
 * Адаптер Donatello. Транспорт — REST с заголовком `X-Token` (без OAuth):
 *  - GET /api/v1/me           — валидация токена + ник аккаунта.
 *  - GET /api/v1/donates      — история донатов (НЕ виджетный long-poll, чтобы не «красть»
 *                               алерты у OBS-виджета стримера). Дедуп — на стороне gateway по id.
 */
const API = 'https://donatello.to/api/v1';

interface RawDonate {
  pubId?: unknown;
  clientName?: unknown;
  message?: unknown;
  amount?: unknown;
  currency?: unknown;
  isPublished?: unknown;
  createdAt?: unknown;
}

async function get(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${API}/${path}`, { headers: { 'X-Token': token } });
  if (!res.ok) throw new Error(`donatello ${path} -> ${res.status}`);
  return res.json();
}

/** "YYYY-MM-DD HH:MM:SS" → мс. Пробел → 'T' для кроссдвижкового парсинга; NaN → 0. */
function parseAt(raw: unknown): number {
  if (typeof raw !== 'string') return 0;
  const t = Date.parse(raw.replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

export const donatelloAdapter: DonationAdapter = {
  provider: 'donatello',

  async validate(token) {
    const me = (await get(token, 'me')) as { nickname?: unknown };
    return { name: typeof me.nickname === 'string' ? me.nickname : null };
  },

  async fetchRecent(token) {
    const data = (await get(token, 'donates?page=0&size=20')) as { content?: RawDonate[] };
    const list = Array.isArray(data.content) ? data.content : [];
    const events: DonationEvent[] = [];
    for (const d of list) {
      if (!d || typeof d.pubId !== 'string') continue;
      if (d.isPublished === false) continue; // неопубликованные/в обработке — пропускаем
      events.push({
        id: d.pubId,
        at: parseAt(d.createdAt),
        donorName: typeof d.clientName === 'string' ? d.clientName : null,
        amount: typeof d.amount === 'number' ? d.amount : 0,
        currency: typeof d.currency === 'string' ? d.currency : '',
        message: typeof d.message === 'string' ? d.message : null,
      });
    }
    // Порядок выдачи API не гарантирован — сортируем по времени (старые → новые).
    events.sort((a, b) => a.at - b.at);
    return events;
  },
};
