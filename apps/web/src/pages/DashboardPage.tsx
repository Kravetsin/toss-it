import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import type {
  ChannelSettings,
  HistoryEntry,
  ListedUser,
  MeResponse,
  SubmissionSummary,
} from '@tmw/shared';
import {
  approveSubmission,
  getBans,
  getHistory,
  getMe,
  getNowPlaying,
  getPending,
  getSettings,
  getWhitelist,
  rejectSubmission,
  removeBan,
  removeFromWhitelist,
  saveSettings,
  skipCurrent,
  uploadMedia,
} from '../api';

export function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [pending, setPending] = useState<SubmissionSummary[]>([]);
  const [now, setNow] = useState<SubmissionSummary | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshLists = useCallback(() => {
    void getWhitelist().then(setAllowed).catch(() => {});
    void getBans().then(setBanned).catch(() => {});
    void getHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    void getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me === 'loading' || !me?.channel) return;

    void getPending().then(setPending).catch(() => {});
    void getNowPlaying()
      .then((r) => setNow(r.now))
      .catch(() => {});
    void getSettings().then(setSettings).catch(() => {});
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
    socket.on('playback:started', (s: SubmissionSummary) => setNow(s));
    socket.on('playback:ended', () => {
      setNow(null);
      void getHistory().then(setHistory).catch(() => {});
    });
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

  async function sendTest(e: FormEvent) {
    e.preventDefault();
    if (!testFile || me === 'loading' || !me?.user) return;
    const login = me.user.login;
    await act(() => uploadMedia(login, testFile));
    setTestFile(null);
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

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Сейчас играет</h2>
        {now ? (
          <p>
            <b>{now.senderName ?? 'аноним'}</b> · {now.mime} ·{' '}
            {Math.round(now.durationMs / 1000)} с{' '}
            <button onClick={() => void act(skipCurrent)} style={{ marginLeft: 8 }}>
              ⏭ Скип
            </button>
          </p>
        ) : (
          <p style={{ color: '#888' }}>Ничего не играет.</p>
        )}
        <form onSubmit={(e) => void sendTest(e)} style={{ display: 'flex', gap: 8 }}>
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,audio/*"
            onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={!testFile}>
            Тестовая отправка
          </button>
        </form>
      </section>

      {settings && (
        <SettingsForm
          settings={settings}
          onSave={(patch) => void act(async () => setSettings(await saveSettings(patch)))}
        />
      )}

      <h2>Очередь модерации ({pending.length})</h2>
      {pending.length === 0 && (
        <p style={{ color: '#888' }}>Пусто. Новые отправки появятся сами.</p>
      )}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {pending.map((s) => (
          <div key={s.id} style={cardStyle}>
            <p style={{ margin: '0 0 0.5rem' }}>
              <b>{s.senderName ?? 'аноним'}</b> · {s.mime} ·{' '}
              {Math.round(s.durationMs / 1000)} с · {new Date(s.createdAt).toLocaleTimeString()}
            </p>
            <Preview s={s} />
            <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0 0' }}>
              <button onClick={() => void act(() => approveSubmission(s.id, false))}>
                ✅ Одобрить
              </button>
              <button onClick={() => void act(() => approveSubmission(s.id, true), refreshLists)}>
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

      <h2>История ({history.length})</h2>
      {history.length === 0 ? (
        <p style={{ color: '#888' }}>Пока ничего не показывалось.</p>
      ) : (
        <ul>
          {history.map((h) => (
            <li key={h.id}>
              {statusIcon(h.status)} <b>{h.senderName ?? 'аноним'}</b> · {h.kind} ·{' '}
              {new Date(h.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function statusIcon(status: HistoryEntry['status']): string {
  if (status === 'played') return '▶️';
  if (status === 'rejected') return '❌';
  return '⌛';
}

function SettingsForm({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const [maxDurS, setMaxDurS] = useState(Math.round(settings.maxDurationMs / 1000));
  const [maxSizeMb, setMaxSizeMb] = useState(Math.round(settings.maxFileSizeBytes / 1024 / 1024));
  const [volume, setVolume] = useState(settings.volume);
  const [showSender, setShowSender] = useState(settings.showSenderName);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>
        Настройки{' '}
        <label style={{ fontSize: '0.8em', fontWeight: 'normal', marginLeft: 12 }}>
          <input
            type="checkbox"
            checked={settings.accepting}
            onChange={(e) => onSave({ accepting: e.target.checked })}
          />{' '}
          приём отправок {settings.accepting ? 'включён' : '⛔ ОСТАНОВЛЕН'}
        </label>
      </h2>
      <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <label>
          Макс. длительность показа: {maxDurS} с
          <input
            type="range"
            min={1}
            max={60}
            value={maxDurS}
            onChange={(e) => setMaxDurS(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Макс. размер файла: {maxSizeMb} МБ
          <input
            type="range"
            min={1}
            max={50}
            value={maxSizeMb}
            onChange={(e) => setMaxSizeMb(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Громкость: {volume}%
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={showSender}
            onChange={(e) => setShowSender(e.target.checked)}
          />{' '}
          показывать имя отправителя в оверлее
        </label>
        <button
          onClick={() =>
            onSave({
              maxDurationMs: maxDurS * 1000,
              maxFileSizeBytes: maxSizeMb * 1024 * 1024,
              volume,
              showSenderName: showSender,
            })
          }
        >
          Сохранить настройки
        </button>
      </div>
    </section>
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

const cardStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 8,
  padding: '1rem',
  marginBottom: '1rem',
};
