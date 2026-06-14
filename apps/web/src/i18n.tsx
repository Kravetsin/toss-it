import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Lang = 'en' | 'ru';

const STORAGE_KEY = 'tmw_lang';

type Params = Record<string, string | number>;
type Dict = Record<string, string>;

const en: Dict = {
  'lang.en': 'EN',
  'lang.ru': 'RU',

  'common.loading': 'Loading…',
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.loginTwitch': 'Log in with Twitch',

  'toast.saved': 'Saved',
  'toast.tokenReissued': 'Token reissued',
  'toast.channelCreated': 'Channel created',
  'toast.approved': 'Approved',
  'toast.rejected': 'Rejected',
  'toast.banned': 'User banned',
  'toast.removed': 'Removed',
  'toast.skipped': 'Skipped',
  'toast.testSent': 'Test sent',
  'common.empty': 'Empty.',
  'common.anon': 'anonymous',
  'common.home': '← Home',

  // Длительность
  'dur.sec': '{n}s',
  'dur.min': '{n} min',
  'dur.minSec': '{m} min {s}s',

  // Главная
  'home.tagline':
    'Viewers send images, GIFs, videos and sounds straight to your stream — with moderation, a whitelist and limits.',
  'home.loginOther': 'Log in with a different account',
  'home.devLogin': 'Dev login without Twitch keys',
  'home.devPlaceholder': 'pick a login',
  'home.logInShort': 'Log in',
  'home.logout': 'Log out',
  'home.noChannel': 'No channel yet. Create one — you get a viewer page and an OBS overlay.',
  'home.createChannel': 'Create channel',
  'home.manage': 'Manage',
  'home.dashboardBtn': 'Moderation dashboard',
  'home.viewerPageBtn': 'Viewer page',
  'home.viewerLinkLabel': 'Viewer link — drop it in chat or pin it in your stream description:',
  'home.overlayTitle': 'OBS overlay',
  'home.overlayDesc':
    'Add a Browser Source with this URL. The URL contains a secret token — don’t show it on stream.',
  'home.copy': 'Copy',
  'home.copied': 'Copied',
  'home.rotate': 'Reissue token',
  'home.rotateConfirm': 'The old URL in OBS will stop working. Reissue?',

  // Страница зрителя
  'channel.notFoundTitle': 'Channel not found',
  'channel.notFoundBody': 'Channel {login} does not exist.',
  'channel.subtitle': 'Send media — it appears on stream',
  'channel.limitVideo': 'video/photo up to {dur}',
  'channel.limitAudio': 'audio up to {dur}',
  'channel.limitSize': 'up to {mb} MB',
  'channel.limitText': 'text up to {n} chars',
  'channel.textPlaceholder': 'Write a message…',
  'channel.captionPlaceholder': 'Add a caption (optional)…',
  'channel.paused': 'The streamer paused submissions — check back later.',
  'channel.loginToSend': 'You need to log in with Twitch to send media',
  'channel.dropzone': 'Drag a file here or click to choose',
  'channel.sendingAs': 'Sending as {name}',
  'channel.tooBig': 'File too large: channel limit is {mb} MB',
  'channel.send': 'Send to stream',
  'channel.removeFile': 'Remove',
  'channel.processing': 'The server is processing your file (trimming and transcoding)…',
  'channel.uploading': 'Uploading: {pct}%',
  'channel.cooldown': 'You can send again in {time}',

  // Живой статус отправки
  'status.pending': 'Waiting for moderation',
  'status.approved': 'Approved — waiting in the queue',
  'status.playing': 'Now on stream!',
  'status.played': 'Shown on stream!',
  'status.rejected': 'Rejected by the streamer',
  'status.expired': 'Expired — was not shown in time',

  // Лидерборд
  'channel.leaderboard': 'Top contributors',
  'channel.leaderboardEmpty': 'No memes on stream yet — be the first!',
  'channel.you': 'you',

  // Дашборд
  'dash.title': 'Dashboard',
  'dash.notifyOn': 'Sound on new submission: ON',
  'dash.notifyOff': 'Sound on new submission: OFF',
  'dash.loginToView': 'The dashboard is available after logging in',
  'dash.createFirstPre': 'First ',
  'dash.createFirstLink': 'create a channel',
  'dash.nowPlaying': 'Now playing',
  'dash.nothingPlaying': 'Nothing playing',
  'dash.skip': 'Skip',
  'dash.testSend': 'Test submission',
  'dash.settings': 'Settings',
  'dash.accepting': 'Accepting',
  'dash.acceptingOff': 'Submissions paused',
  'dash.sliderVideo': 'Video & images: up to {n}s',
  'dash.sliderAudio': 'Audio: up to {n} min',
  'dash.sliderSize': 'File: up to {n} MB',
  'dash.sliderVolume': 'Volume: {n}%',
  'dash.layout': 'Overlay layout',
  'dash.position': 'Media position',
  'dash.sliderMediaSize': 'Media size: {n}%',
  'dash.sliderMargin': 'Edge margin: {n}%',
  'dash.preview': 'Preview',
  'dash.previewMedia': 'media',
  'dash.previewMusic': 'player',
  'dash.positionShort': 'Position',
  'dash.musicSeparate': 'separate position for the music player',
  'dash.musicLayout': 'Music player',
  'dash.musicSizeNote': 'The player is always shown compact — only its position matters.',
  'dash.showSender': 'show sender name in the overlay',
  'dash.soundAlert': 'play a sound when media appears',
  'dash.tts': 'read the sender’s name aloud (TTS)',
  'dash.ttsMessage': 'read the message text aloud (TTS)',
  'dash.save': 'Save',
  'dash.modQueue': 'Moderation queue',
  'dash.modEmpty': 'Empty. New submissions will appear here automatically.',
  'dash.viewList': 'List',
  'dash.viewReview': 'Review',
  'dash.trusted': 'trusted',
  'dash.later': 'Later',
  'dash.next': 'Next',
  'dash.sessionStats': 'This session: {a} shown · {r} rejected',
  'dash.hotkeyHint': 'Hotkeys active — click inside the page if they don’t respond',
  'dash.approve': 'Approve',
  'dash.approveWhitelist': 'Approve + auto-show',
  'dash.reject': 'Reject',
  'dash.ban': 'Ban',
  'dash.banConfirm': 'Ban {name}? All their submissions will be silently rejected.',
  'dash.thisSender': 'this sender',
  'dash.whitelist': 'Whitelist',
  'dash.whitelistHint': 'shown without moderation',
  'dash.bans': 'Bans',
  'dash.bansHint': 'silent rejection',
  'dash.since': 'since {date}',
  'dash.removeUser': 'remove',
  'dash.history': 'History',
  'dash.historyEmpty': 'Nothing has been shown yet.',
};

const ru: Dict = {
  'lang.en': 'EN',
  'lang.ru': 'RU',

  'common.loading': 'Загрузка…',
  'common.confirm': 'Подтвердить',
  'common.cancel': 'Отмена',
  'common.loginTwitch': 'Войти через Twitch',

  'toast.saved': 'Сохранено',
  'toast.tokenReissued': 'Токен перевыпущен',
  'toast.channelCreated': 'Канал создан',
  'toast.approved': 'Одобрено',
  'toast.rejected': 'Отклонено',
  'toast.banned': 'Пользователь забанен',
  'toast.removed': 'Удалено',
  'toast.skipped': 'Пропущено',
  'toast.testSent': 'Тест отправлен',
  'common.empty': 'Пусто.',
  'common.anon': 'аноним',
  'common.home': '← на главную',

  'dur.sec': '{n} с',
  'dur.min': '{n} мин',
  'dur.minSec': '{m} мин {s} с',

  'home.tagline':
    'Зрители отправляют картинки, гифки, видео и звуки прямо на твой стрим — с модерацией, белым списком и лимитами.',
  'home.loginOther': 'Войти под другим аккаунтом',
  'home.devLogin': 'Dev-вход без Twitch-ключей',
  'home.devPlaceholder': 'придумай логин',
  'home.logInShort': 'Войти',
  'home.logout': 'Выйти',
  'home.noChannel': 'Канала ещё нет. Создай его — получишь страницу для зрителей и оверлей для OBS.',
  'home.createChannel': 'Создать канал',
  'home.manage': 'Управление',
  'home.dashboardBtn': 'Дашборд модерации',
  'home.viewerPageBtn': 'Страница зрителя',
  'home.viewerLinkLabel': 'Ссылка для зрителей — отправь её в чат или закрепи в описании стрима:',
  'home.overlayTitle': 'Оверлей для OBS',
  'home.overlayDesc':
    'Добавь Browser Source с этим URL. URL содержит секретный токен — не показывай его на стриме.',
  'home.copy': 'Скопировать',
  'home.copied': 'Скопировано',
  'home.rotate': 'Перевыпустить токен',
  'home.rotateConfirm': 'Старый URL в OBS перестанет работать. Перевыпустить?',

  'channel.notFoundTitle': 'Канал не найден',
  'channel.notFoundBody': 'Канала {login} не существует.',
  'channel.subtitle': 'Отправь медиа — оно появится на стриме',
  'channel.limitVideo': 'видео/фото до {dur}',
  'channel.limitAudio': 'аудио до {dur}',
  'channel.limitSize': 'до {mb} МБ',
  'channel.limitText': 'текст до {n} симв.',
  'channel.textPlaceholder': 'Напиши сообщение…',
  'channel.captionPlaceholder': 'Подпись к файлу (необязательно)…',
  'channel.paused': 'Стример приостановил приём отправок — загляни позже.',
  'channel.loginToSend': 'Чтобы отправлять медиа, нужно войти через Twitch',
  'channel.dropzone': 'Перетащи файл сюда или нажми, чтобы выбрать',
  'channel.sendingAs': 'Отправляешь как {name}',
  'channel.tooBig': 'Файл слишком большой: лимит канала {mb} МБ',
  'channel.send': 'Отправить на стрим',
  'channel.removeFile': 'Убрать',
  'channel.processing': 'Сервер обрабатывает файл (обрезка и перекодирование)…',
  'channel.uploading': 'Загрузка: {pct}%',
  'channel.cooldown': 'Отправить снова можно через {time}',

  'status.pending': 'Ждёт модерации',
  'status.approved': 'Одобрено — в очереди показа',
  'status.playing': 'Сейчас на стриме!',
  'status.played': 'Показано на стриме!',
  'status.rejected': 'Отклонено стримером',
  'status.expired': 'Истекло — не успело показаться',

  'channel.leaderboard': 'Топ отправителей',
  'channel.leaderboardEmpty': 'Пока никто не отправлял — будь первым!',
  'channel.you': 'ты',

  'dash.title': 'Дашборд',
  'dash.notifyOn': 'Звук на новую отправку: ВКЛ',
  'dash.notifyOff': 'Звук на новую отправку: ВЫКЛ',
  'dash.loginToView': 'Дашборд доступен после входа',
  'dash.createFirstPre': 'Сначала ',
  'dash.createFirstLink': 'создай канал',
  'dash.nowPlaying': 'Сейчас играет',
  'dash.nothingPlaying': 'Ничего не играет',
  'dash.skip': 'Скип',
  'dash.testSend': 'Тестовая отправка',
  'dash.settings': 'Настройки',
  'dash.accepting': 'Приём включён',
  'dash.acceptingOff': 'Приём остановлен',
  'dash.sliderVideo': 'Видео и фото: до {n} с',
  'dash.sliderAudio': 'Аудио: до {n} мин',
  'dash.sliderSize': 'Файл: до {n} МБ',
  'dash.sliderVolume': 'Громкость: {n}%',
  'dash.layout': 'Раскладка оверлея',
  'dash.position': 'Позиция медиа',
  'dash.sliderMediaSize': 'Размер медиа: {n}%',
  'dash.sliderMargin': 'Отступ от края: {n}%',
  'dash.preview': 'Превью',
  'dash.previewMedia': 'медиа',
  'dash.previewMusic': 'плеер',
  'dash.positionShort': 'Позиция',
  'dash.musicSeparate': 'отдельная позиция для музыкального плеера',
  'dash.musicLayout': 'Музыкальный плеер',
  'dash.musicSizeNote': 'Плеер всегда компактный — настраивается только позиция.',
  'dash.showSender': 'показывать имя отправителя в оверлее',
  'dash.soundAlert': 'звук при появлении медиа',
  'dash.tts': 'озвучивать имя отправителя (TTS)',
  'dash.ttsMessage': 'озвучивать текст сообщения (TTS)',
  'dash.save': 'Сохранить',
  'dash.modQueue': 'Очередь модерации',
  'dash.modEmpty': 'Пусто. Новые отправки появятся здесь сами.',
  'dash.viewList': 'Список',
  'dash.viewReview': 'Разбор',
  'dash.trusted': 'доверенный',
  'dash.later': 'Позже',
  'dash.next': 'Дальше',
  'dash.sessionStats': 'За сессию: {a} показано · {r} отклонено',
  'dash.hotkeyHint': 'Горячие клавиши активны — кликни внутри страницы, если не реагируют',
  'dash.approve': 'Одобрить',
  'dash.approveWhitelist': 'Одобрить + автопоказ',
  'dash.reject': 'Отклонить',
  'dash.ban': 'Бан',
  'dash.banConfirm': 'Забанить {name}? Все его отправки будут молча отклоняться.',
  'dash.thisSender': 'отправителя',
  'dash.whitelist': 'Белый список',
  'dash.whitelistHint': 'играют без модерации',
  'dash.bans': 'Баны',
  'dash.bansHint': 'молчаливое отклонение',
  'dash.since': 'с {date}',
  'dash.removeUser': 'убрать',
  'dash.history': 'История',
  'dash.historyEmpty': 'Пока ничего не показывалось.',
};

const dicts: Record<Lang, Dict> = { en, ru };

export type TFn = (key: string, params?: Params) => string;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const I18nContext = createContext<I18nValue | null>(null);

function detectInitial(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'ru' ? 'ru' : 'en'; // английский по умолчанию
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback<TFn>(
    (key, params) => interpolate(dicts[lang][key] ?? en[key] ?? key, params),
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Локализованная длительность из миллисекунд: «15s» / «3 мин 20 с» и т.п. */
export function formatDuration(ms: number, t: TFn): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return t('dur.sec', { n: total });
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? t('dur.min', { n: m }) : t('dur.minSec', { m, s });
}

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ['en', 'ru'];
  return (
    <div className="shadow-pixel-sm fixed bottom-4 right-4 z-50 flex overflow-hidden rounded-none border-2 border-line bg-surface font-display text-xs">
      {langs.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`cursor-pointer px-3 py-1.5 font-semibold transition-colors ${
            lang === l ? 'bg-twitch text-white' : 'text-muted hover:text-text'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
