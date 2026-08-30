import { useEffect, useRef, useState } from 'react';
import { GIFT, type GiftTarget } from '@tmw/shared';
import { giftDust, searchGiftTargets } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useToast } from '@/providers/ToastProvider';
import { Avatar, Button, Input } from '@/ui';
import { Icon } from '@/ui/icons';
import { DustMark } from '@/components/DustMark';

/** Long enough that the list stops flickering under a fast typist, short enough to feel live. */
const DEBOUNCE_MS = 220;

/**
 * Handing dust to someone, from the site.
 *
 * Search and PICK — never a bare name field. A gift cannot be taken back, so the one thing this
 * must never do is act on a string the giver typed: one wrong character and someone else's dust is
 * gone to a stranger with a similar name. Picking from a list of real accounts also answers the
 * question a chat command cannot — "is this person even on Tossit?".
 *
 * It lives in the shop because that is where the balance already is, and it is folded away until
 * asked for: most visits here are to spend, not to give.
 */
export function GiftPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { me, refresh } = useMe();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GiftTarget[]>([]);
  const [picked, setPicked] = useState<GiftTarget | null>(null);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  /** Guards against an older search landing after a newer one. */
  const seq = useRef(0);

  useEffect(() => {
    if (!open || picked || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    const id = window.setTimeout(() => {
      searchGiftTargets(q)
        .then((rows) => {
          if (seq.current === mine) setHits(rows);
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [q, open, picked]);

  const balance = me?.user?.stardust ?? 0;
  const n = Number.parseInt(amount, 10);
  const canSend = !!picked && Number.isFinite(n) && n >= GIFT.min && n <= balance && !sending;

  async function send() {
    if (!picked || !canSend) return;
    setSending(true);
    try {
      await giftDust(picked.userId, n);
      toast(t('gift.sent', { n, who: picked.displayName }), 'ok');
      setPicked(null);
      setQ('');
      setAmount('');
      setOpen(false);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm text-muted ring-1 ring-white/10 transition-colors hover:text-text hover:ring-white/25"
      >
        <Icon name="gift" size={15} className="text-accent" />
        {t('gift.open')}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] p-3 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-faint">{t('gift.open')}</span>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => setOpen(false)}
          className="cursor-pointer text-faint hover:text-text"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {picked ? (
        // Once picked, the person is shown rather than described: the giver has to be able to see
        // who is about to receive their dust right up to the moment they send it.
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-white/5 px-2 py-1.5">
          <Avatar url={picked.avatarUrl} name={picked.displayName} size={24} />
          <span className="min-w-0 flex-1 truncate text-sm">
            {picked.displayName}
            <span className="ml-1 text-faint">
              {picked.platformName ? `${picked.platformName} ` : ''}@{picked.login}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="cursor-pointer text-xs text-faint underline decoration-dotted hover:text-text"
          >
            {t('gift.change')}
          </button>
        </div>
      ) : (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gift.search')} />
          {hits.length > 0 && (
            <ul className="flex flex-col">
              {hits.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    onClick={() => setPicked(u)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  >
                    <Avatar url={u.avatarUrl} name={u.displayName} size={24} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {u.displayName}
                      {/* A bought name hides who this is; in a list that sends money away, that
                          belongs on screen and not behind a hover. */}
                      <span className="ml-1 text-faint">
                        {u.platformName ? `${u.platformName} ` : ''}@{u.login}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && hits.length === 0 && (
            <span className="px-2 text-xs text-faint">{t('gift.nobody')}</span>
          )}
        </>
      )}

      {picked && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('gift.amount', { n: GIFT.min })}
          />
          <Button variant="accent" onClick={send} disabled={!canSend} className="shrink-0">
            <DustMark />
            {t('gift.send')}
          </Button>
        </div>
      )}
    </div>
  );
}
