import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
  banUser,
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
import { formatDuration, useI18n } from '../i18n';
import { initAudioUnlock, playNotify } from '../notify';
import { Alert, Button, Card } from '../ui';

export function DashboardPage() {
  const { t } = useI18n();
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [pending, setPending] = useState<SubmissionSummary[]>([]);
  const [now, setNow] = useState<SubmissionSummary | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('tmw_modsound') !== '0');
  // Читаем актуальное значение из обработчика сокета без переподключения при переключении.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  useEffect(() => {
    initAudioUnlock();
  }, []);

  // Счётчик в заголовке вкладки — виден, даже когда дашборд в фоне.
  useEffect(() => {
    document.title = (pending.length > 0 ? `(${pending.length}) ` : '') + 'Twitch Media Widget';
    return () => {
      document.title = 'Twitch Media Widget';
    };
  }, [pending.length]);

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
    const socket = io({ query: { role: 'dashboard', token: me.channel.overlayToken } });
    socket.on('moderation:new', (s: SubmissionSummary) =>
      setPending((prev) => {
        if (prev.some((p) => p.id === s.id)) return prev;
        if (soundOnRef.current) playNotify(); // звуковой сигнал на новую отправку
        return [...prev, s];
      }),
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

  const bannedIds = new Set(banned.map((b) => b.userId));
  function banById(userId: string, name: string) {
    if (window.confirm(t('dash.banConfirm', { name }))) {
      void act(() => banUser(userId), refreshLists);
    }
  }

  if (me === 'loading') return <Shell>{t('common.loading')}</Shell>;
  if (!me?.user) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-4 py-10">
          <p className="text-muted">{t('dash.loginToView')}</p>
          <a href="/api/auth/login?returnTo=/dashboard">
            <Button variant="primary">{t('common.loginTwitch')}</Button>
          </a>
        </Card>
      </Shell>
    );
  }
  if (!me.channel) {
    return (
      <Shell>
        <p className="text-muted">
          {t('dash.createFirstPre')}
          <Link to="/" className="text-twitch-light underline">
            {t('dash.createFirstLink')}
          </Link>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('dash.title')}</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              localStorage.setItem('tmw_modsound', next ? '1' : '0');
              if (next) playNotify(); // дать услышать и заодно разблокировать аудио
            }}
            title={soundOn ? t('dash.notifyOn') : t('dash.notifyOff')}
            className="cursor-pointer text-lg"
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <Link to="/" className="text-sm text-muted hover:text-text">
            {t('common.home')}
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {/* Сейчас играет */}
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">{t('dash.nowPlaying')}</h2>
            {now ? (
              <p className="mt-1 text-sm text-muted">
                <b className="text-text">{now.senderName ?? t('common.anon')}</b> · {now.mime} ·{' '}
                {formatDuration(now.durationMs, t)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">{t('dash.nothingPlaying')}</p>
            )}
          </div>
          {now && (
            <Button variant="danger" className="shrink-0" onClick={() => void act(skipCurrent)}>
              {t('dash.skip')}
            </Button>
          )}
        </div>
        <form
          onSubmit={(e) => void sendTest(e)}
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
        >
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,audio/*"
            onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text"
          />
          <Button type="submit" disabled={!testFile}>
            {t('dash.testSend')}
          </Button>
        </form>
      </Card>

      {settings && (
        <SettingsCard
          settings={settings}
          onSave={(patch) => void act(async () => setSettings(await saveSettings(patch)))}
        />
      )}

      {/* Модерация */}
      <h2 className="mb-3 mt-8 text-lg font-bold">
        {t('dash.modQueue')}{' '}
        {pending.length > 0 && (
          <span className="ml-1 rounded-full bg-twitch px-2.5 py-0.5 text-sm text-white">
            {pending.length}
          </span>
        )}
      </h2>
      {pending.length === 0 && <p className="text-sm text-muted">{t('dash.modEmpty')}</p>}
      <div className="flex flex-col gap-3">
        {pending.map((s) => (
          <Card key={s.id}>
            <p className="mb-2 text-sm text-muted">
              <b className="text-text">{s.senderName ?? t('common.anon')}</b> · {s.mime} ·{' '}
              {formatDuration(s.durationMs, t)} · {new Date(s.createdAt).toLocaleTimeString()}
            </p>
            <Preview s={s} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void act(() => approveSubmission(s.id, false))}>
                {t('dash.approve')}
              </Button>
              <Button onClick={() => void act(() => approveSubmission(s.id, true), refreshLists)}>
                {t('dash.approveWhitelist')}
              </Button>
              <Button variant="ghost" onClick={() => void act(() => rejectSubmission(s.id, false))}>
                {t('dash.reject')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const name = s.senderName ?? t('dash.thisSender');
                  if (window.confirm(t('dash.banConfirm', { name }))) {
                    void act(() => rejectSubmission(s.id, true), refreshLists);
                  }
                }}
              >
                {t('dash.ban')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <UserList
          title={t('dash.whitelist')}
          hint={t('dash.whitelistHint')}
          users={allowed}
          onRemove={(id) => void act(() => removeFromWhitelist(id), refreshLists)}
          onBan={banById}
        />
        <UserList
          title={t('dash.bans')}
          hint={t('dash.bansHint')}
          users={banned}
          onRemove={(id) => void act(() => removeBan(id), refreshLists)}
        />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">{t('dash.history')}</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">{t('dash.historyEmpty')}</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-1.5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-muted">
                <span>{statusIcon(h.status)}</span>
                <b className="text-text">{h.senderName ?? t('common.anon')}</b>
                <span>· {h.kind}</span>
                <span className="ml-auto text-xs">{new Date(h.createdAt).toLocaleString()}</span>
                {h.senderUserId && !bannedIds.has(h.senderUserId) && (
                  <button
                    onClick={() => banById(h.senderUserId!, h.senderName ?? t('dash.thisSender'))}
                    className="cursor-pointer text-xs text-muted hover:text-danger"
                    title={t('dash.ban')}
                  >
                    🔨
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}

function statusIcon(status: HistoryEntry['status']): string {
  if (status === 'played') return '▶️';
  if (status === 'rejected') return '❌';
  return '⌛';
}

function SettingsCard({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const [maxDurS, setMaxDurS] = useState(Math.round(settings.maxDurationMs / 1000));
  const [maxAudioMin, setMaxAudioMin] = useState(
    Math.min(10, Math.max(1, Math.round(settings.maxAudioDurationMs / 60_000))),
  );
  const [maxSizeMb, setMaxSizeMb] = useState(Math.round(settings.maxFileSizeBytes / 1024 / 1024));
  const [volume, setVolume] = useState(settings.volume);
  const [showSender, setShowSender] = useState(settings.showSenderName);
  const [soundAlert, setSoundAlert] = useState(settings.soundAlert);
  const [ttsName, setTtsName] = useState(settings.ttsName);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{t('dash.settings')}</h2>
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
            settings.accepting ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'
          }`}
        >
          <input
            type="checkbox"
            checked={settings.accepting}
            onChange={(e) => onSave({ accepting: e.target.checked })}
            className="accent-current"
          />
          {settings.accepting ? t('dash.accepting') : t('dash.acceptingOff')}
        </label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Slider
          label={t('dash.sliderVideo', { n: maxDurS })}
          min={1}
          max={60}
          value={maxDurS}
          onChange={setMaxDurS}
        />
        <Slider
          label={t('dash.sliderAudio', { n: maxAudioMin })}
          min={1}
          max={10}
          value={maxAudioMin}
          onChange={setMaxAudioMin}
        />
        <Slider
          label={t('dash.sliderSize', { n: maxSizeMb })}
          min={1}
          max={50}
          value={maxSizeMb}
          onChange={setMaxSizeMb}
        />
        <Slider
          label={t('dash.sliderVolume', { n: volume })}
          min={0}
          max={100}
          value={volume}
          onChange={setVolume}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Toggle checked={showSender} onChange={setShowSender} label={t('dash.showSender')} />
        <Toggle checked={soundAlert} onChange={setSoundAlert} label={t('dash.soundAlert')} />
        <Toggle checked={ttsName} onChange={setTtsName} label={t('dash.tts')} />
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          onClick={() =>
            onSave({
              maxDurationMs: maxDurS * 1000,
              maxAudioDurationMs: maxAudioMin * 60_000,
              maxFileSizeBytes: maxSizeMb * 1024 * 1024,
              volume,
              showSenderName: showSender,
              soundAlert,
              ttsName,
            })
          }
        >
          {t('dash.save')}
        </Button>
      </div>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-twitch"
      />
      {label}
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-sm text-muted">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-twitch"
      />
    </label>
  );
}

function Preview({ s }: { s: SubmissionSummary }) {
  const cls = 'max-h-60 max-w-sm rounded-lg bg-black/40';
  if (s.kind === 'image') return <img src={s.url} className={cls} />;
  if (s.kind === 'video') return <video src={s.url} controls muted className={cls} />;
  return <audio src={s.url} controls />;
}

function UserList({
  title,
  hint,
  users,
  onRemove,
  onBan,
}: {
  title: string;
  hint: string;
  users: ListedUser[];
  onRemove: (userId: string) => void;
  onBan?: (userId: string, displayName: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <h2 className="font-bold">
        {title} <span className="text-sm font-normal text-muted">— {hint}</span>
      </h2>
      {users.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('common.empty')}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {users.map((u) => (
            <li key={u.userId} className="flex items-center gap-2">
              <b>{u.displayName}</b>
              <span className="text-xs text-muted">
                {t('dash.since', { date: new Date(u.addedAt).toLocaleDateString() })}
              </span>
              <span className="ml-auto flex gap-2">
                {onBan && (
                  <button
                    onClick={() => onBan(u.userId, u.displayName)}
                    className="cursor-pointer text-xs text-muted hover:text-danger"
                    title={t('dash.ban')}
                  >
                    🔨
                  </button>
                )}
                <button
                  onClick={() => onRemove(u.userId)}
                  className="cursor-pointer text-xs text-muted hover:text-danger"
                >
                  {t('dash.removeUser')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">{children}</main>;
}
