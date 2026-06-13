import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MeResponse } from '@tmw/shared';
import { OVERLAY_BASE_URL, createChannel, getMe, logout, rotateOverlayToken } from '../api';
import { Alert, Avatar, Button, Card } from '../ui';

export function HomePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fakeLogin, setFakeLogin] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function copy(key: string, value: string) {
    void navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  }

  const refresh = () =>
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <Shell>Загрузка…</Shell>;

  if (!me?.user) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <h1 className="text-4xl font-extrabold">
            Twitch <span className="text-twitch-light">Media</span> Widget
          </h1>
          <p className="max-w-md text-muted">
            Зрители отправляют картинки, гифки, видео и звуки прямо на твой стрим — с
            модерацией, белым списком и лимитами.
          </p>
          <a href="/api/auth/login?returnTo=/">
            <Button variant="primary" className="px-8 py-3 text-base">
              Войти через Twitch
            </Button>
          </a>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer hover:text-text">
              Dev-вход без Twitch-ключей
            </summary>
            <div className="mt-3 flex gap-2">
              <input
                placeholder="придумай логин"
                value={fakeLogin}
                onChange={(e) => setFakeLogin(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-text outline-none focus:border-twitch"
              />
              <Button
                disabled={!fakeLogin}
                onClick={() => {
                  window.location.href = `/api/auth/login?fake=${encodeURIComponent(fakeLogin)}&returnTo=/`;
                }}
              >
                Войти
              </Button>
            </div>
          </details>
        </div>
      </Shell>
    );
  }

  const overlayUrl = me.channel ? `${OVERLAY_BASE_URL}/?token=${me.channel.overlayToken}` : null;
  const viewerUrl = `${window.location.origin}/c/${me.user.login}`;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar url={me.user.avatarUrl} name={me.user.displayName} size={44} />
          <div>
            <p className="font-semibold">{me.user.displayName}</p>
            <p className="text-xs text-muted">{me.user.login}</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => void act(logout)}>
          Выйти
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {!me.channel ? (
        <Card className="mt-6 flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-muted">
            Канала ещё нет. Создай его — получишь страницу для зрителей и оверлей для OBS.
          </p>
          <Button variant="primary" onClick={() => void act(createChannel)}>
            ✨ Создать канал
          </Button>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Управление</h2>
            <div className="flex flex-wrap gap-2">
              <Link to="/dashboard">
                <Button variant="primary">🛡 Дашборд модерации</Button>
              </Link>
              <Link to={`/c/${me.user.login}`}>
                <Button>👁 Страница зрителя</Button>
              </Link>
            </div>
            <p className="mb-2 mt-4 text-sm text-muted">
              Ссылка для зрителей — отправь её в чат или закрепи в описании стрима:
            </p>
            <div className="flex items-center gap-2">
              <a
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 break-all rounded-lg bg-surface-2 px-3 py-2 text-sm text-twitch-light hover:underline"
              >
                {viewerUrl}
              </a>
              <Button className="shrink-0" onClick={() => copy('viewer', viewerUrl)}>
                {copiedKey === 'viewer' ? '✅' : '📋'}
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-bold">Оверлей для OBS</h2>
            <p className="mb-3 text-sm text-muted">
              Добавь Browser Source с этим URL. ⚠️ URL содержит секретный токен — не
              показывай его на стриме.
            </p>
            <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              {overlayUrl}
            </code>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => copy('overlay', overlayUrl!)}>
                {copiedKey === 'overlay' ? '✅ Скопировано' : '📋 Скопировать'}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm('Старый URL в OBS перестанет работать. Перевыпустить?')) {
                    void act(rotateOverlayToken);
                  }
                }}
              >
                ♻️ Перевыпустить токен
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">{children}</main>;
}
