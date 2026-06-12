import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { MeResponse, PublicChannelInfo } from '@tmw/shared';
import { getChannel, getMe, uploadMedia } from '../api';

export function ChannelPage() {
  const { login = '' } = useParams();
  const [channel, setChannel] = useState<PublicChannelInfo | null | 'loading'>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getChannel(login).then(setChannel).catch(() => setChannel(null));
    void getMe().then(setMe).catch(() => setMe(null));
  }, [login]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await uploadMedia(login, file);
      setMessage(
        res.status === 'pending'
          ? '🕐 Отправлено! Ждёт одобрения стримера.'
          : `✅ Принято! Позиция в очереди: ${res.queuePosition}, ` +
              `длительность показа: ${Math.round(res.durationMs / 1000)} с`,
      );
      setFile(null);
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (channel === 'loading') return <main style={pageStyle}>Загрузка…</main>;
  if (!channel) {
    return (
      <main style={pageStyle}>
        <h1>Канал не найден</h1>
        <p>
          Канала <code>{login}</code> не существует.
        </p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1>Канал {channel.displayName}</h1>
      <p>Отправь картинку, гифку, видео или звук — оно появится на стриме.</p>

      {!me?.user ? (
        <p>
          <a href={`/api/auth/login?returnTo=/c/${encodeURIComponent(login)}`}>
            <button>Войти через Twitch, чтобы отправлять</button>
          </a>
        </p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0 }}>
            Отправляешь как <b>{me.user.displayName}</b>
          </p>
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={!file || busy}>
            {busy ? 'Отправляю…' : 'Отправить на стрим'}
          </button>
        </form>
      )}

      {message && <p>{message}</p>}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  padding: '2rem',
  maxWidth: 560,
};
