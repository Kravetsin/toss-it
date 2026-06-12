import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MeResponse } from '@tmw/shared';
import { OVERLAY_BASE_URL, createChannel, getMe, logout, rotateOverlayToken } from '../api';

export function HomePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fakeLogin, setFakeLogin] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <main style={pageStyle}>Загрузка…</main>;

  if (!me?.user) {
    return (
      <main style={pageStyle}>
        <h1>Twitch Media Widget</h1>
        <p>Зрители отправляют медиа на твой стрим. Войди, чтобы создать канал.</p>
        <p>
          <a href="/api/auth/login?returnTo=/">
            <button>Войти через Twitch</button>
          </a>
        </p>
        <details>
          <summary>Dev-вход без Twitch-ключей</summary>
          <p>
            <input
              placeholder="придумай логин"
              value={fakeLogin}
              onChange={(e) => setFakeLogin(e.target.value)}
            />{' '}
            <button
              disabled={!fakeLogin}
              onClick={() => {
                window.location.href = `/api/auth/login?fake=${encodeURIComponent(fakeLogin)}&returnTo=/`;
              }}
            >
              Fake-войти
            </button>
          </p>
        </details>
      </main>
    );
  }

  const overlayUrl = me.channel
    ? `${OVERLAY_BASE_URL}/?token=${me.channel.overlayToken}`
    : null;

  return (
    <main style={pageStyle}>
      <h1>Twitch Media Widget</h1>
      <p>
        Привет, <b>{me.user.displayName}</b>!{' '}
        <button onClick={() => void act(logout)}>Выйти</button>
      </p>

      {!me.channel ? (
        <p>
          <button onClick={() => void act(createChannel)}>Создать канал</button>
        </p>
      ) : (
        <>
          <h2>Твой канал</h2>
          <p>
            <Link to="/dashboard">
              <button>Открыть дашборд модерации</button>
            </Link>
          </p>
          <p>
            Страница для зрителей:{' '}
            <Link to={`/c/${me.user.login}`}>
              /c/{me.user.login}
            </Link>{' '}
            — отправь её в чат или закрепи в описании стрима.
          </p>
          <h3>Оверлей для OBS</h3>
          <p>
            Добавь Browser Source с этим URL (содержит секретный токен — не свети его на
            стриме):
          </p>
          <p>
            <code style={{ wordBreak: 'break-all' }}>{overlayUrl}</code>
          </p>
          <p>
            <button onClick={() => void navigator.clipboard.writeText(overlayUrl!)}>
              Скопировать
            </button>{' '}
            <button onClick={() => void act(rotateOverlayToken)}>
              Перевыпустить токен
            </button>
          </p>
        </>
      )}

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  padding: '2rem',
  maxWidth: 640,
};
