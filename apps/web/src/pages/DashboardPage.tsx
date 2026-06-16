import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  OVERLAY_POSITIONS,
  positionToFlex,
  type AccessibleChannel,
  type ChannelSettings,
  type HistoryEntry,
  type ListedUser,
  type MediaKind,
  type MeResponse,
  type OverlayPosition,
  type ReputationStats,
  type SubmissionSummary,
} from '@tmw/shared';
import {
  approveSubmission,
  banUser,
  getBans,
  getHistory,
  getMe,
  getMyChannels,
  getNowPlaying,
  getPending,
  getReputation,
  getSettings,
  getWhitelist,
  rejectSubmission,
  removeBan,
  removeFromWhitelist,
  saveSettings,
  skipCurrent,
  uploadMedia,
} from '../api';
import { useConfirm } from '../confirm';
import { Icon, type IconName } from '../icons';
import { formatDuration, useI18n } from '../i18n';
import { initAudioUnlock, playNotify } from '../notify';
import { useToast } from '../toast';
import { Badge, Button, Card, Loader } from '../ui';

export function DashboardPage() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  // Каналы, к которым есть доступ (свои + где модератор), и выбранный сейчас.
  const [channelsList, setChannelsList] = useState<AccessibleChannel[] | 'loading'>('loading');
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('tmw_dash_channel');
    } catch {
      return null;
    }
  });
  const [pending, setPending] = useState<SubmissionSummary[]>([]);
  const [now, setNow] = useState<SubmissionSummary | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  // Кэш кросс-канальной репутации по userId (догружаем по мере появления заявок).
  const [reputation, setReputation] = useState<Record<string, ReputationStats>>({});
  const reputationRef = useRef(reputation);
  reputationRef.current = reputation;
  const [testFile, setTestFile] = useState<File | null>(null);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('tmw_modsound') !== '0');
  // Читаем актуальное значение из обработчика сокета без переподключения при переключении.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  // Вид очереди: «Список» (всё разом) или «Разбор» (по одной с хоткеями). Запоминаем выбор.
  const [queueView, setQueueView] = useState<'list' | 'review'>(() =>
    localStorage.getItem('tmw_queueview') === 'review' ? 'review' : 'list',
  );
  const changeQueueView = (v: 'list' | 'review') => {
    setQueueView(v);
    try {
      localStorage.setItem('tmw_queueview', v);
    } catch {
      /* приватный режим — не критично */
    }
  };

  // Текущий канал и роль в нём.
  const list = Array.isArray(channelsList) ? channelsList : [];
  const current = list.find((c) => c.channelId === currentId) ?? list[0] ?? null;
  const channelId = current?.channelId ?? null;
  const isOwner = current?.role === 'owner';

  useEffect(() => {
    initAudioUnlock();
  }, []);

  // Пользователь + доступные каналы.
  useEffect(() => {
    void getMe()
      .then(setMe)
      .catch(() => setMe(null));
    void getMyChannels()
      .then((ch) => {
        setChannelsList(ch);
        setCurrentId((prev) => (prev && ch.some((c) => c.channelId === prev) ? prev : ch[0]?.channelId ?? null));
      })
      .catch(() => setChannelsList([]));
  }, []);

  // Запоминаем выбранный канал.
  useEffect(() => {
    if (channelId) {
      try {
        localStorage.setItem('tmw_dash_channel', channelId);
      } catch {
        /* приватный режим */
      }
    }
  }, [channelId]);

  // Счётчик в заголовке вкладки — виден, даже когда дашборд в фоне.
  useEffect(() => {
    document.title = (pending.length > 0 ? `(${pending.length}) ` : '') + 'Tossit';
    return () => {
      document.title = 'Tossit';
    };
  }, [pending.length]);

  // Догружаем репутацию для новых отправителей в очереди (только отсутствующих в кэше).
  useEffect(() => {
    if (!channelId) return;
    const ids = [...new Set(pending.map((p) => p.senderUserId).filter((x): x is string => !!x))].filter(
      (id) => !(id in reputationRef.current),
    );
    if (ids.length === 0) return;
    void getReputation(channelId, ids)
      .then((rep) => setReputation((prev) => ({ ...prev, ...rep })))
      .catch(() => {});
  }, [pending, channelId]);

  const refreshLists = useCallback(() => {
    if (!channelId) return;
    void getWhitelist(channelId).then(setAllowed).catch(() => {});
    void getBans(channelId).then(setBanned).catch(() => {});
    void getHistory(channelId).then(setHistory).catch(() => {});
  }, [channelId]);

  // Загрузка данных канала + live-сокет. Перезапускается при смене канала.
  useEffect(() => {
    if (!channelId) return;
    setPending([]);
    setNow(null);
    setSettings(null);
    setAllowed([]);
    setBanned([]);
    setReputation({});

    void getPending(channelId).then(setPending).catch(() => {});
    void getNowPlaying(channelId)
      .then((r) => setNow(r.now))
      .catch(() => {});
    // Настройки доступны только владельцу.
    if (isOwner) void getSettings(channelId).then(setSettings).catch(() => {});
    refreshLists();

    // Live-обновления: авторизация по сессионной куке (модератору overlayToken не нужен).
    const socket = io({ query: { role: 'dashboard', channelId } });
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
      void getHistory(channelId).then(setHistory).catch(() => {});
    });
    return () => {
      socket.close();
    };
  }, [channelId, isOwner, refreshLists]);

  async function act(fn: () => Promise<unknown>, after?: () => void, success?: string) {
    try {
      await fn();
      after?.();
      if (success) toast(success);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    }
  }

  async function sendTest(e: FormEvent) {
    e.preventDefault();
    if (!testFile || !current) return;
    await act(() => uploadMedia(current.login, testFile), undefined, t('toast.testSent'));
    setTestFile(null);
  }

  const bannedIds = new Set(banned.map((b) => b.userId));
  async function banById(userId: string, name: string) {
    if (!channelId) return;
    if (await confirm({ message: t('dash.banConfirm', { name }), confirmLabel: t('dash.ban'), danger: true })) {
      void act(() => banUser(channelId, userId), refreshLists, t('toast.banned'));
    }
  }

  // Действия модерации — общие для вида «Список» и «Разбор».
  const onApprove = (s: SubmissionSummary) =>
    channelId && void act(() => approveSubmission(channelId, s.id, false), undefined, t('toast.approved'));
  const onTrust = (s: SubmissionSummary) =>
    channelId && void act(() => approveSubmission(channelId, s.id, true), refreshLists, t('toast.approved'));
  const onReject = (s: SubmissionSummary) =>
    channelId && void act(() => rejectSubmission(channelId, s.id, false), undefined, t('toast.rejected'));
  const onBan = (s: SubmissionSummary) => {
    void (async () => {
      if (!channelId) return;
      const name = s.senderName ?? t('dash.thisSender');
      if (await confirm({ message: t('dash.banConfirm', { name }), confirmLabel: t('dash.ban'), danger: true })) {
        void act(() => rejectSubmission(channelId, s.id, true), refreshLists, t('toast.banned'));
      }
    })();
  };
  // «Позже» — только клиентский reorder: текущую заявку в конец очереди.
  const onLater = (id: string) =>
    setPending((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      if (i < 0) return prev;
      const copy = prev.slice();
      const removed = copy.splice(i, 1);
      copy.push(...removed);
      return copy;
    });

  if (me === 'loading' || channelsList === 'loading')
    return (
      <Shell>
        <Loader label={t('common.loading')} />
      </Shell>
    );
  if (!me?.user) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-muted">{t('dash.loginToView')}</p>
          <div className="flex flex-col items-center gap-2">
            <a href="/api/auth/login?returnTo=/dashboard">
              <Button variant="primary">{t('common.loginTwitch')}</Button>
            </a>
            <a href="/api/auth/google/login?returnTo=/dashboard">
              <Button>{t('common.loginGoogle')}</Button>
            </a>
          </div>
        </Card>
      </Shell>
    );
  }
  if (!current) {
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
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="shield" size={26} className="text-twitch-light" />
          {t('dash.title')}
          {me.user.isFounder && (
            <Badge>
              <Icon name="sparkles" size={12} />
              {t('badge.founder')}
            </Badge>
          )}
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              localStorage.setItem('tmw_modsound', next ? '1' : '0');
              if (next) playNotify(); // дать услышать и заодно разблокировать аудио
            }}
            title={soundOn ? t('dash.notifyOn') : t('dash.notifyOff')}
            className="cursor-pointer text-muted hover:text-text"
          >
            <Icon name={soundOn ? 'bell' : 'bell-off'} size={22} />
          </button>
          <Link to="/" className="text-sm text-muted hover:text-text">
            {t('common.home')}
          </Link>
        </div>
      </div>

      {(list.length > 1 || current.role === 'moderator') && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {list.length > 1 ? (
            <>
              <span className="text-muted">{t('dash.channel')}:</span>
              <select
                value={channelId ?? ''}
                onChange={(e) => setCurrentId(e.target.value)}
                className="rounded-none border-2 border-line bg-surface-2 px-2 py-1 text-text outline-none focus:border-twitch"
              >
                {list.map((c) => (
                  <option key={c.channelId} value={c.channelId}>
                    {c.displayName}
                    {c.role === 'moderator' ? ` — ${t('dash.roleModerator')}` : ''}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="text-muted">{current.displayName}</span>
          )}
          {current.role === 'moderator' && (
            <span className="border border-twitch/40 bg-twitch/15 px-2 py-0.5 text-xs text-twitch-light">
              {t('dash.roleModerator')}
            </span>
          )}
        </div>
      )}

      {/* Сейчас играет */}
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">{t('dash.nowPlaying')}</h2>
            {now ? (
              <p className="mt-1 text-sm text-muted">
                <b className="text-text">{now.senderName ?? t('common.anon')}</b> ·{' '}
                {now.kind === 'youtube' ? 'YouTube' : now.mime} ·{' '}
                {now.kind === 'youtube' && now.durationMs <= 0
                  ? '∞'
                  : formatDuration(now.durationMs, t)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">{t('dash.nothingPlaying')}</p>
            )}
          </div>
          {now && channelId && (
            <Button
              variant="danger"
              className="shrink-0"
              onClick={() => void act(() => skipCurrent(channelId), undefined, t('toast.skipped'))}
            >
              <Icon name="forward" size={16} />
              {t('dash.skip')}
            </Button>
          )}
        </div>
        {isOwner && (
        <form
          onSubmit={(e) => void sendTest(e)}
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
        >
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,audio/*"
            onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-none file:border-2 file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:font-display file:text-text"
          />
          <Button type="submit" disabled={!testFile}>
            <Icon name="send" size={16} />
            {t('dash.testSend')}
          </Button>
        </form>
        )}
      </Card>

      {isOwner && settings && channelId && (
        <SettingsCard
          settings={settings}
          onSave={(patch) =>
            void act(async () => setSettings(await saveSettings(channelId, patch)), undefined, t('toast.saved'))
          }
        />
      )}


      {/* Модерация */}
      <ModerationQueue
        pending={pending}
        allowed={allowed}
        reputation={reputation}
        view={queueView}
        onView={changeQueueView}
        onApprove={onApprove}
        onTrust={onTrust}
        onReject={onReject}
        onBan={onBan}
        onLater={onLater}
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <UserList
          icon="star"
          title={t('dash.whitelist')}
          hint={t('dash.whitelistHint')}
          users={allowed}
          onRemove={(id) =>
            channelId &&
            void act(() => removeFromWhitelist(channelId, id), refreshLists, t('toast.removed'))
          }
          onBan={(id, name) => void banById(id, name)}
        />
        <UserList
          icon="user-x"
          title={t('dash.bans')}
          hint={t('dash.bansHint')}
          users={banned}
          onRemove={(id) =>
            channelId && void act(() => removeBan(channelId, id), refreshLists, t('toast.removed'))
          }
        />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">{t('dash.history')}</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">{t('dash.historyEmpty')}</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-1.5 text-sm">
            {history.map((h) => {
              const si = STATUS_ICON[h.status];
              return (
                <li key={h.id} className="flex items-center gap-2 text-muted">
                  <Icon name={si.icon} size={15} className={si.cls} />
                  <b className="text-text">{h.senderName ?? t('common.anon')}</b>
                  <span>· {h.kind}</span>
                  <span className="ml-auto text-xs">{new Date(h.createdAt).toLocaleString()}</span>
                  {h.senderUserId && !bannedIds.has(h.senderUserId) && (
                    <button
                      onClick={() => void banById(h.senderUserId!, h.senderName ?? t('dash.thisSender'))}
                      className="cursor-pointer text-muted hover:text-danger"
                      title={t('dash.ban')}
                    >
                      <Icon name="user-x" size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </Shell>
  );
}

const STATUS_ICON: Record<HistoryEntry['status'], { icon: IconName; cls: string }> = {
  pending: { icon: 'clock', cls: 'text-warn' },
  approved: { icon: 'check', cls: 'text-ok' },
  played: { icon: 'play', cls: 'text-ok' },
  rejected: { icon: 'close', cls: 'text-danger' },
  expired: { icon: 'clock', cls: 'text-muted' },
};

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
  const [ttsMessage, setTtsMessage] = useState(settings.ttsMessage);
  const [position, setPosition] = useState<OverlayPosition>(settings.overlayPosition);
  const [mediaSize, setMediaSize] = useState(settings.overlaySize);
  const [margin, setMargin] = useState(settings.overlayMargin);
  const [musicSeparate, setMusicSeparate] = useState(settings.musicSeparate);
  const [musicPos, setMusicPos] = useState<OverlayPosition>(settings.musicPosition);
  const [musicMargin, setMusicMargin] = useState(settings.musicMargin);
  // Карточка настроек большая и заслоняет очередь модерации — по умолчанию свёрнута.
  // Состояние помним в localStorage, чтобы не сворачивалось при каждом заходе.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('tmw_settings_open') === '1';
    } catch {
      return false;
    }
  });
  const toggleOpen = () =>
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem('tmw_settings_open', next ? '1' : '0');
      } catch {
        /* приватный режим — не критично */
      }
      return next;
    });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className="flex cursor-pointer items-center gap-2"
        >
          <Icon
            name="play"
            size={13}
            className={`transition-transform text-muted ${open ? 'rotate-90' : ''}`}
          />
          <h2 className="font-bold">{t('dash.settings')}</h2>
        </button>
        <label
          className={`flex cursor-pointer items-center gap-2 border-2 px-3 py-1.5 text-sm font-semibold ${
            settings.accepting ? 'border-ok/40 bg-ok/15 text-ok' : 'border-danger/40 bg-danger/15 text-danger'
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
      {open && (
        <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Slider
          icon="image"
          label={t('dash.sliderVideo', { n: maxDurS })}
          min={1}
          max={60}
          value={maxDurS}
          onChange={setMaxDurS}
        />
        <Slider
          icon="volume-2"
          label={t('dash.sliderAudio', { n: maxAudioMin })}
          min={1}
          max={10}
          value={maxAudioMin}
          onChange={setMaxAudioMin}
        />
        <Slider
          icon="save"
          label={t('dash.sliderSize', { n: maxSizeMb })}
          min={1}
          max={50}
          value={maxSizeMb}
          onChange={setMaxSizeMb}
        />
        <Slider
          icon="volume-3"
          label={t('dash.sliderVolume', { n: volume })}
          min={0}
          max={100}
          value={volume}
          onChange={setVolume}
        />
      </div>
      <div className="mt-6 border-t-2 border-line pt-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
          {t('dash.layout')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-sm text-muted">{t('dash.position')}</span>
            <PositionGrid value={position} onChange={setPosition} />
          </div>
          <LayoutPreview position={position} size={mediaSize} margin={margin} label={t('dash.previewMedia')} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Slider
            icon="image"
            label={t('dash.sliderMediaSize', { n: mediaSize })}
            min={10}
            max={100}
            value={mediaSize}
            onChange={setMediaSize}
          />
          <Slider
            icon="monitor"
            label={t('dash.sliderMargin', { n: margin })}
            min={0}
            max={25}
            value={margin}
            onChange={setMargin}
          />
        </div>
        <div className="mt-4">
          <Toggle
            checked={musicSeparate}
            onChange={setMusicSeparate}
            label={t('dash.musicSeparate')}
          />
        </div>
        {musicSeparate && (
          <div className="mt-3 border-l-2 border-twitch/40 pl-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-twitch-light">
              <Icon name="volume-2" size={15} />
              {t('dash.musicLayout')}
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-sm text-muted">{t('dash.positionShort')}</span>
                <PositionGrid value={musicPos} onChange={setMusicPos} />
              </div>
              <LayoutPreview
                position={musicPos}
                size={22}
                margin={musicMargin}
                label={t('dash.previewMusic')}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Slider
                icon="monitor"
                label={t('dash.sliderMargin', { n: musicMargin })}
                min={0}
                max={25}
                value={musicMargin}
                onChange={setMusicMargin}
              />
            </div>
            <p className="mt-2 text-xs text-muted">{t('dash.musicSizeNote')}</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Toggle checked={showSender} onChange={setShowSender} label={t('dash.showSender')} />
        <Toggle checked={soundAlert} onChange={setSoundAlert} label={t('dash.soundAlert')} />
        <Toggle checked={ttsName} onChange={setTtsName} label={t('dash.tts')} />
        <Toggle checked={ttsMessage} onChange={setTtsMessage} label={t('dash.ttsMessage')} />
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
              ttsMessage,
              overlayPosition: position,
              overlaySize: mediaSize,
              overlayMargin: margin,
              musicSeparate,
              musicPosition: musicPos,
              musicMargin,
            })
          }
        >
          {t('dash.save')}
        </Button>
      </div>
        </>
      )}
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
  icon,
  label,
  min,
  max,
  value,
  onChange,
}: {
  icon: IconName;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-sm text-muted">
      <span className="flex items-center gap-1.5">
        <Icon name={icon} size={15} />
        {label}
      </span>
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

/** Сетка 3×3 якорей. Точка в каждой кнопке стоит в соответствующем углу (через positionToFlex). */
function PositionGrid({
  value,
  onChange,
}: {
  value: OverlayPosition;
  onChange: (p: OverlayPosition) => void;
}) {
  return (
    <div className="mt-1 grid w-max grid-cols-3 gap-1">
      {OVERLAY_POSITIONS.map((p) => {
        const { justify, align } = positionToFlex(p);
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            aria-label={p}
            aria-pressed={active}
            onClick={() => onChange(p)}
            style={{ justifyContent: justify, alignItems: align }}
            className={`flex h-9 w-9 cursor-pointer border-2 p-1.5 ${
              active
                ? 'border-twitch-dark bg-twitch/30'
                : 'border-line bg-surface-2 hover:border-twitch-light'
            }`}
          >
            <span className={`h-2 w-2 ${active ? 'bg-twitch-light' : 'bg-muted'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Мини-превью 16:9: плейсхолдер медиа в текущей позиции/размере/отступе (тот же positionToFlex). */
function LayoutPreview({
  position,
  size,
  margin,
  label,
}: {
  position: OverlayPosition;
  size: number;
  margin: number;
  label: string;
}) {
  const { t } = useI18n();
  const { justify, align } = positionToFlex(position);
  return (
    <div>
      <span className="text-sm text-muted">{t('dash.preview')}</span>
      <div
        className="scanlines mt-1 flex aspect-[16/9] w-full overflow-hidden border-2 border-line bg-surface-2"
        style={{ justifyContent: justify, alignItems: align }}
      >
        <div
          className="flex shrink-0 items-center justify-center border border-twitch-light bg-twitch/60 text-[10px] text-white"
          style={{
            // Размер — от всего бокса (как медиа от вьюпорта), не от области внутри отступа.
            width: `${size}%`,
            height: `${size}%`,
            // Отступ прижимает к краю, НЕ меняя размер. % margin относителен ширины,
            // поэтому для вертикали умножаем на 9/16, чтобы попасть в vh-отступ оверлея.
            marginInline: `${margin}%`,
            marginBlock: `${(margin * 9) / 16}%`,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

const KIND_ICON: Record<MediaKind, IconName> = {
  image: 'image',
  video: 'play',
  audio: 'volume-2',
  text: 'send',
  youtube: 'play',
};

/** Кросс-канальная репутация отправителя: бейдж founder · ✓принято · ✗отклонено · WL · BAN (или «новичок»). */
function RepChip({ rep }: { rep?: ReputationStats }) {
  const { t } = useI18n();
  if (!rep) return null;
  // Бейдж первопроходца — независимо от счётчиков (виден и у новичков).
  const founder = rep.isFounder ? (
    <Badge>
      <Icon name="sparkles" size={11} />
      {t('badge.founder')}
    </Badge>
  ) : null;
  if (rep.accepted === 0 && rep.rejected === 0) {
    return (
      <span className="flex items-center gap-2">
        {founder}
        <span className="w-max border border-twitch/40 bg-twitch/15 px-1.5 text-xs text-twitch-light">
          {t('dash.repNew')}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
      {founder}
      <span className="flex items-center gap-0.5 text-ok" title={t('dash.repAccepted')}>
        <Icon name="check" size={12} />
        {rep.accepted}
      </span>
      <span className="flex items-center gap-0.5" title={t('dash.repRejected')}>
        <Icon name="close" size={12} />
        {rep.rejected}
      </span>
      <span className="flex items-center gap-0.5" title={t('dash.repWhitelisted')}>
        <Icon name="star" size={12} />
        {rep.whitelistedChannels}
      </span>
      <span
        className={`flex items-center gap-0.5 ${rep.bannedChannels > 0 ? 'text-danger' : ''}`}
        title={t('dash.repBanned')}
      >
        <Icon name="user-x" size={12} />
        {rep.bannedChannels}
      </span>
    </span>
  );
}

/** Очередь модерации с двумя видами: «Список» (всё разом) и «Разбор» (по одной + хоткеи). */
function ModerationQueue({
  pending,
  allowed,
  reputation,
  view,
  onView,
  onApprove,
  onTrust,
  onReject,
  onBan,
  onLater,
}: {
  pending: SubmissionSummary[];
  allowed: ListedUser[];
  reputation: Record<string, ReputationStats>;
  view: 'list' | 'review';
  onView: (v: 'list' | 'review') => void;
  onApprove: (s: SubmissionSummary) => void;
  onTrust: (s: SubmissionSummary) => void;
  onReject: (s: SubmissionSummary) => void;
  onBan: (s: SubmissionSummary) => void;
  onLater: (id: string) => void;
}) {
  const { t } = useI18n();
  const [stats, setStats] = useState({ approved: 0, rejected: 0 });
  const trustedIds = new Set(allowed.map((a) => a.userId));

  const approve = (s: SubmissionSummary) => {
    onApprove(s);
    setStats((p) => ({ ...p, approved: p.approved + 1 }));
  };
  const trust = (s: SubmissionSummary) => {
    onTrust(s);
    setStats((p) => ({ ...p, approved: p.approved + 1 }));
  };
  const reject = (s: SubmissionSummary) => {
    onReject(s);
    setStats((p) => ({ ...p, rejected: p.rejected + 1 }));
  };

  // Хоткеи активны только в разборе; действуют на голову очереди (pending[0]).
  useEffect(() => {
    if (view !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (document.querySelector('[role="dialog"]')) return; // открыт confirm бана
      const cur = pending[0];
      if (!cur) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        approve(cur);
      } else if (k === 'r' || e.key === 'ArrowLeft') {
        e.preventDefault();
        reject(cur);
      } else if (k === 'w') {
        e.preventDefault();
        trust(cur);
      } else if (k === 'b') {
        e.preventDefault();
        onBan(cur);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onLater(cur.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          {t('dash.modQueue')}
          {pending.length > 0 && (
            <span className="border-2 border-twitch-dark bg-twitch px-2 py-0.5 text-sm text-white">
              {pending.length}
            </span>
          )}
        </h2>
        <div className="flex gap-1 border-2 border-line bg-surface-2 p-1">
          <ViewBtn active={view === 'list'} onClick={() => onView('list')} label={t('dash.viewList')} />
          <ViewBtn active={view === 'review'} onClick={() => onView('review')} label={t('dash.viewReview')} />
        </div>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted">{t('dash.modEmpty')}</p>
      ) : view === 'list' ? (
        <div className="flex flex-col gap-3">
          {pending.map((s) => (
            <Card key={s.id}>
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span className="flex items-center gap-2">
                  <Icon name={KIND_ICON[s.kind]} size={15} />
                  <b className="text-text">{s.senderName ?? t('common.anon')}</b>
                  {s.senderUserId && trustedIds.has(s.senderUserId) && (
                    <span className="border border-ok/40 bg-ok/15 px-1.5 text-xs text-ok">{t('dash.trusted')}</span>
                  )}
                </span>
                <RepChip rep={s.senderUserId ? reputation[s.senderUserId] : undefined} />
                <span className="text-xs">
                  {s.kind === 'youtube' && s.durationMs <= 0
                    ? '∞'
                    : formatDuration(s.durationMs, t)}{' '}
                  · {new Date(s.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <Preview s={s} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => approve(s)}>
                  <Icon name="check" size={16} />
                  {t('dash.approve')}
                </Button>
                <Button onClick={() => trust(s)}>
                  <Icon name="star" size={16} />
                  {t('dash.approveWhitelist')}
                </Button>
                <Button variant="ghost" onClick={() => reject(s)}>
                  <Icon name="close" size={16} />
                  {t('dash.reject')}
                </Button>
                <Button variant="danger" onClick={() => onBan(s)}>
                  <Icon name="user-x" size={16} />
                  {t('dash.ban')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        (() => {
          const head = pending[0]!;
          return (
            <ReviewCard
              cur={head}
              rest={pending.length - 1}
              next={pending.slice(1, 8)}
              trusted={!!head.senderUserId && trustedIds.has(head.senderUserId)}
              rep={head.senderUserId ? reputation[head.senderUserId] : undefined}
              onApprove={() => approve(head)}
              onTrust={() => trust(head)}
              onReject={() => reject(head)}
              onBan={() => onBan(head)}
              onLater={() => onLater(head.id)}
            />
          );
        })()
      )}

      {(stats.approved > 0 || stats.rejected > 0) && (
        <p className="mt-3 text-xs text-muted">
          {t('dash.sessionStats', { a: stats.approved, r: stats.rejected })}
        </p>
      )}
    </>
  );
}

function ViewBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer px-3 py-1 font-display text-sm uppercase tracking-wide ${
        active ? 'bg-twitch text-white' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

function Kbd({ k }: { k: string }) {
  return (
    <span className="ml-1 border border-line px-1 text-xs normal-case text-muted">{k}</span>
  );
}

/** Фокус-карточка разбора: одна заявка крупно + кнопки с хоткеями + «дальше». */
function ReviewCard({
  cur,
  rest,
  next,
  trusted,
  rep,
  onApprove,
  onTrust,
  onReject,
  onBan,
  onLater,
}: {
  cur: SubmissionSummary;
  rest: number;
  next: SubmissionSummary[];
  trusted: boolean;
  rep?: ReputationStats;
  onApprove: () => void;
  onTrust: () => void;
  onReject: () => void;
  onBan: () => void;
  onLater: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Icon name={KIND_ICON[cur.kind]} size={18} className="text-twitch-light" />
            <b className="text-text">{cur.senderName ?? t('common.anon')}</b>
            {trusted && (
              <span className="border border-ok/40 bg-ok/15 px-1.5 text-xs text-ok">{t('dash.trusted')}</span>
            )}
          </div>
          <RepChip rep={rep} />
        </div>
        <span className="shrink-0 text-xs text-muted">
          {cur.kind === 'youtube' && cur.durationMs <= 0 ? '∞' : formatDuration(cur.durationMs, t)}
        </span>
      </div>
      <div className="mt-3">
        <Preview s={cur} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onApprove}>
          <Icon name="check" size={16} />
          {t('dash.approve')}
          <Kbd k="Space" />
        </Button>
        <Button onClick={onTrust}>
          <Icon name="star" size={16} />
          {t('dash.approveWhitelist')}
          <Kbd k="W" />
        </Button>
        <Button variant="ghost" onClick={onReject}>
          <Icon name="close" size={16} />
          {t('dash.reject')}
          <Kbd k="R" />
        </Button>
        <Button onClick={onLater}>
          <Icon name="clock" size={16} />
          {t('dash.later')}
          <Kbd k="↓" />
        </Button>
        <Button variant="danger" onClick={onBan}>
          <Icon name="user-x" size={16} />
          {t('dash.ban')}
          <Kbd k="B" />
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t('dash.next')}:</span>
        {next.map((n) => (
          <span
            key={n.id}
            title={n.senderName ?? ''}
            className="flex h-7 w-7 items-center justify-center border-2 border-line bg-surface-2"
          >
            <Icon name={KIND_ICON[n.kind]} size={14} />
          </span>
        ))}
        {rest > next.length && <span>+{rest - next.length}</span>}
      </div>
      <p className="mt-3 text-xs text-muted/70">{t('dash.hotkeyHint')}</p>
    </Card>
  );
}

function Preview({ s }: { s: SubmissionSummary }) {
  const cls = 'max-h-60 max-w-sm rounded-none bg-black/40';
  const media =
    s.kind === 'text' ? null : s.kind === 'image' ? (
      <img src={s.url} className={cls} />
    ) : s.kind === 'video' ? (
      <video src={s.url} controls muted className={cls} />
    ) : s.kind === 'youtube' ? (
      s.youtubeId ? (
        <iframe
          src={`https://www.youtube.com/embed/${s.youtubeId}`}
          className="aspect-video w-full max-w-sm rounded-none"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : null
    ) : (
      <audio src={s.url} controls />
    );
  return (
    <div className="flex flex-col items-start gap-2">
      {media}
      {s.text && (
        <p className="whitespace-pre-wrap border-l-2 border-twitch/50 bg-surface-2 px-3 py-2 text-sm text-text">
          {s.text}
        </p>
      )}
    </div>
  );
}

function UserList({
  icon,
  title,
  hint,
  users,
  onRemove,
  onBan,
}: {
  icon: IconName;
  title: string;
  hint: string;
  users: ListedUser[];
  onRemove: (userId: string) => void;
  onBan?: (userId: string, displayName: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-bold">
        <Icon name={icon} size={18} className="text-twitch-light" />
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{hint}</p>
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
                    className="cursor-pointer text-muted hover:text-danger"
                    title={t('dash.ban')}
                  >
                    <Icon name="user-x" size={16} />
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
