import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import type { ListedUser, MeResponse, SubmissionSummary } from '@tmw/shared';
import {
  approveSubmission,
  getBans,
  getMe,
  getPending,
  getWhitelist,
  rejectSubmission,
  removeBan,
  removeFromWhitelist,
} from '../api';

export function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [pending, setPending] = useState<SubmissionSummary[]>([]);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshLists = useCallback(() => {
    void getWhitelist().then(setAllowed).catch(() => {});
    void getBans().then(setBanned).catch(() => {});
  }, []);

  useEffect(() => {
    void getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me === 'loading' || !me?.channel) return;

    void getPending().then(setPending).catch(() => {});
    refreshLists();

    // Live-обновления: тот же секретный токен канала, что и у оверлея.
    // Сокет идёт через vite-proxy (same-origin), поэтому без CORS-плясок.
    const socket = io({ query: { role: 'dashboard', token: me.channel.overlayToken } });
    socket.on('moderation:new', (s: SubmissionSummary) =>
      setPending((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s])),
    );
    socket.on('moderation:resolved', (id: string) =>
      setPending((prev) => prev.filter((p) => p.id !== id)),
    );
    return () => {
      socket.close();
    };
  }, [me, refreshLists]);

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (me === 'loading') return <main style={pageStyle}>Загрузка…</main>;
  if (!me?.user) {
    return (
      <main style={pageStyle}>
        <h1>Дашборд</h1>
        <p>
          <a href="/api/auth/login?returnTo=/dashboard">
            <button>Войти через Twitch</button>
          </a>
        </p>
      </main>
    );
  }
  if (!me.channel) {
    return (
      <main style={pageStyle}>
        <h1>Дашборд</h1>
        <p>
          Сначала <Link to="/">создай канал</Link>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ ...pageStyle, maxWidth: 860 }}>
      <h1>Дашборд — {me.user.displayName}</h1>
      <p>
        <Link to="/">← на главную</Link>
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <h2>Очередь модерации ({pending.length})</h2>
      {pending.length === 0 && <p style={{ color: '#888' }}>Пусто. Новые отправки появятся сами.</p>}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {pending.map((s) => (
          <div
            key={s.id}
            style={{ border: '1px solid #ccc', borderRadius: 8, padding: '1rem' }}
          >
            <p style={{ margin: '0 0 0.5rem' }}>
              <b>{s.senderName ?? 'аноним'}</b> · {s.mime} ·{' '}
              {Math.round(s.durationMs / 1000)} с · {new Date(s.createdAt).toLocaleTimeString()}
            </p>
            <Preview s={s} />
            <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0 0' }}>
              <button onClick={() => void act(() => approveSubmission(s.id, false))}>
                ✅ Одобрить
              </button>
              <button
                onClick={() => void act(() => approveSubmission(s.id, true), refreshLists)}
              >
                ⭐ Одобрить + в белый список
              </button>
              <button onClick={() => void act(() => rejectSubmission(s.id, false))}>
                ❌ Отклонить
              </button>
              <button onClick={() => void act(() => rejectSubmission(s.id, true), refreshLists)}>
                🔨 Отклонить + бан
              </button>
            </p>
          </div>
        ))}
      </div>

      <UserList
        title="Белый список (автопоказ)"
        users={allowed}
        onRemove={(id) => void act(() => removeFromWhitelist(id), refreshLists)}
      />
      <UserList
        title="Баны"
        users={banned}
        onRemove={(id) => void act(() => removeBan(id), refreshLists)}
      />
    </main>
  );
}

function Preview({ s }: { s: SubmissionSummary }) {
  const style: React.CSSProperties = { maxWidth: 320, maxHeight: 240 };
  if (s.kind === 'image') return <img src={s.url} style={style} />;
  if (s.kind === 'video') return <video src={s.url} controls muted style={style} />;
  return <audio src={s.url} controls />;
}

function UserList({
  title,
  users,
  onRemove,
}: {
  title: string;
  users: ListedUser[];
  onRemove: (userId: string) => void;
}) {
  return (
    <>
      <h2>
        {title} ({users.length})
      </h2>
      {users.length === 0 ? (
        <p style={{ color: '#888' }}>Пусто.</p>
      ) : (
        <ul>
          {users.map((u) => (
            <li key={u.userId}>
              <b>{u.displayName}</b> ({u.login}) — с{' '}
              {new Date(u.addedAt).toLocaleDateString()}{' '}
              <button onClick={() => onRemove(u.userId)}>убрать</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const pageStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  padding: '2rem',
  maxWidth: 640,
};
