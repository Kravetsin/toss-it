import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminPromoCode, MeResponse } from '@tmw/shared';
import { createPromoCodes, getMe, listPromoCodes } from '../api';
import { Icon } from '../icons';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { Badge, Button, Card, Loader } from '../ui';

/** Админка промокодов первопроходца: /admin (только для ADMIN_USER_IDS). */
export function AdminPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [codes, setCodes] = useState<AdminPromoCode[]>([]);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = me !== 'loading' && !!me?.user?.isAdmin;

  const refresh = useCallback(() => {
    void listPromoCodes()
      .then(setCodes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  async function generate() {
    setBusy(true);
    try {
      await createPromoCodes(count, note);
      setNote('');
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  if (me === 'loading') {
    return (
      <Shell>
        <Loader label={t('common.loading')} />
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Icon name="square-alert" size={40} className="text-warn" />
          <p className="text-muted">{t('admin.denied')}</p>
          <Link to="/" className="text-twitch-light underline">
            {t('common.home')}
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="sparkles" size={26} className="text-twitch-light" />
          {t('admin.title')}
        </h1>
        <Link to="/dashboard" className="text-sm text-muted hover:text-text">
          {t('dash.title')}
        </Link>
      </div>

      <Card className="mb-4">
        <h2 className="font-bold">{t('admin.generate')}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted">
            <span>{t('admin.count')}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 block w-20 rounded-none border-2 border-line bg-surface-2 px-2 py-1 text-text outline-none focus:border-twitch"
            />
          </label>
          <label className="flex-1 text-sm text-muted">
            <span>{t('admin.note')}</span>
            <input
              type="text"
              value={note}
              placeholder={t('admin.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full rounded-none border-2 border-line bg-surface-2 px-2 py-1 text-text outline-none focus:border-twitch"
            />
          </label>
          <Button variant="primary" disabled={busy} onClick={() => void generate()}>
            <Icon name="sparkles" size={16} />
            {t('admin.generate')}
          </Button>
        </div>
      </Card>

      {codes.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.empty')}</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {codes.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="border-2 border-line bg-surface-2 px-2 py-0.5 text-twitch-light">
                  {c.code}
                </code>
                {c.redeemedByLogin ? (
                  <span className="text-muted">
                    {t('admin.redeemedBy', { login: c.redeemedByLogin })}
                  </span>
                ) : (
                  <Badge>{t('admin.unused')}</Badge>
                )}
                {c.note && <span className="text-xs text-muted">{c.note}</span>}
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(c.code);
                    toast(t('admin.codeCopied'));
                  }}
                  className="ml-auto cursor-pointer text-muted hover:text-text"
                  title={t('admin.copyCode')}
                >
                  <Icon name="copy" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">{children}</main>;
}
