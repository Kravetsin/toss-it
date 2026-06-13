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
  'common.loginTwitch': 'Log in with Twitch',
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
  'home.createChannel': '✨ Create channel',
  'home.manage': 'Manage',
  'home.dashboardBtn': '🛡 Moderation dashboard',
  'home.viewerPageBtn': '👁 Viewer page',
  'home.viewerLinkLabel': 'Viewer link — drop it in chat or pin it in your stream description:',
  'home.overlayTitle': 'OBS overlay',
  'home.overlayDesc':
    'Add a Browser Source with this URL. ⚠️ The URL contains a secret token — don’t show it on stream.',
  'home.copy': '📋 Copy',
  'home.copied': '✅ Copied',
  'home.rotate': '♻️ Reissue token',
  'home.rotateConfirm': 'The old URL in OBS will stop working. Reissue?',

  // Страница зрителя
  'channel.notFoundTitle': 'Channel not found',
  'channel.notFoundBody': 'Channel {login} does not exist.',
  'channel.subtitle': 'Send media — it appears on stream',
  'channel.limitVideo': '🎬 video/photo up to {dur}',
  'channel.limitAudio': '🎵 audio up to {dur}',
  'channel.limitSize': '📦 up to {mb} MB',
  'channel.paused': '⛔ The streamer paused submissions — check back later.',
  'channel.loginToSend': 'You need to log in with Twitch to send media',
  'channel.dropzone': 'Drag a file here or click to choose',
  'channel.sendingAs': 'Sending as {name}',
  'channel.tooBig': 'File too large: channel limit is {mb} MB',
  'channel.send': '🚀 Send to stream',
  'channel.removeFile': 'Remove',
  'channel.processing': '⚙️ The server is processing your file (trimming and transcoding)…',
  'channel.uploading': '⬆️ Uploading: {pct}%',
  'channel.donePending':
    '🕐 Sent! The streamer will review and approve it — then it goes on stream.',
  'channel.doneApproved': '🎉 Accepted! Queue position: {pos}, on screen for {dur}.',

  // Дашборд
  'dash.title': '🛡 Dashboard',
  'dash.loginToView': 'The dashboard is available after logging in',
  'dash.createFirstPre': 'First ',
  'dash.createFirstLink': 'create a channel',
  'dash.nowPlaying': 'Now playing',
  'dash.nothingPlaying': 'Nothing playing',
  'dash.skip': '⏭ Skip',
  'dash.testSend': 'Test submission',
  'dash.settings': 'Settings',
  'dash.accepting': 'Accepting',
  'dash.acceptingOff': '⛔ Submissions paused',
  'dash.sliderVideo': '🎬 Video & images: up to {n}s',
  'dash.sliderAudio': '🎵 Audio: up to {n} min',
  'dash.sliderSize': '📦 File: up to {n} MB',
  'dash.sliderVolume': '🔊 Volume: {n}%',
  'dash.showSender': 'show sender name in the overlay',
  'dash.save': 'Save',
  'dash.modQueue': 'Moderation queue',
  'dash.modEmpty': 'Empty. New submissions will appear here automatically.',
  'dash.approve': '✅ Approve',
  'dash.approveWhitelist': '⭐ Approve + auto-show',
  'dash.reject': '❌ Reject',
  'dash.ban': '🔨 Ban',
  'dash.banConfirm': 'Ban {name}? All their submissions will be silently rejected.',
  'dash.thisSender': 'this sender',
  'dash.whitelist': '⭐ Whitelist',
  'dash.whitelistHint': 'shown without moderation',
  'dash.bans': '🔨 Bans',
  'dash.bansHint': 'silent rejection',
  'dash.since': 'since {date}',
  'dash.removeUser': 'remove ✕',
  'dash.history': 'History',
  'dash.historyEmpty': 'Nothing has been shown yet.',
};

const ru: Dict = {
  'lang.en': 'EN',
  'lang.ru': 'RU',

  'common.loading': 'Загрузка…',
  'common.loginTwitch': 'Войти через Twitch',
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
  'home.createChannel': '✨ Создать канал',
  'home.manage': 'Управление',
  'home.dashboardBtn': '🛡 Дашборд модерации',
  'home.viewerPageBtn': '👁 Страница зрителя',
  'home.viewerLinkLabel': 'Ссылка для зрителей — отправь её в чат или закрепи в описании стрима:',
  'home.overlayTitle': 'Оверлей для OBS',
  'home.overlayDesc':
    'Добавь Browser Source с этим URL. ⚠️ URL содержит секретный токен — не показывай его на стриме.',
  'home.copy': '📋 Скопировать',
  'home.copied': '✅ Скопировано',
  'home.rotate': '♻️ Перевыпустить токен',
  'home.rotateConfirm': 'Старый URL в OBS перестанет работать. Перевыпустить?',

  'channel.notFoundTitle': 'Канал не найден',
  'channel.notFoundBody': 'Канала {login} не существует.',
  'channel.subtitle': 'Отправь медиа — оно появится на стриме',
  'channel.limitVideo': '🎬 видео/фото до {dur}',
  'channel.limitAudio': '🎵 аудио до {dur}',
  'channel.limitSize': '📦 до {mb} МБ',
  'channel.paused': '⛔ Стример приостановил приём отправок — загляни позже.',
  'channel.loginToSend': 'Чтобы отправлять медиа, нужно войти через Twitch',
  'channel.dropzone': 'Перетащи файл сюда или нажми, чтобы выбрать',
  'channel.sendingAs': 'Отправляешь как {name}',
  'channel.tooBig': 'Файл слишком большой: лимит канала {mb} МБ',
  'channel.send': '🚀 Отправить на стрим',
  'channel.removeFile': 'Убрать',
  'channel.processing': '⚙️ Сервер обрабатывает файл (обрезка и перекодирование)…',
  'channel.uploading': '⬆️ Загрузка: {pct}%',
  'channel.donePending':
    '🕐 Отправлено! Стример посмотрит и одобрит — после этого медиа попадёт на стрим.',
  'channel.doneApproved': '🎉 Принято! Позиция в очереди: {pos}, на экране будет {dur}.',

  'dash.title': '🛡 Дашборд',
  'dash.loginToView': 'Дашборд доступен после входа',
  'dash.createFirstPre': 'Сначала ',
  'dash.createFirstLink': 'создай канал',
  'dash.nowPlaying': 'Сейчас играет',
  'dash.nothingPlaying': 'Ничего не играет',
  'dash.skip': '⏭ Скип',
  'dash.testSend': 'Тестовая отправка',
  'dash.settings': 'Настройки',
  'dash.accepting': 'Приём включён',
  'dash.acceptingOff': '⛔ Приём остановлен',
  'dash.sliderVideo': '🎬 Видео и фото: до {n} с',
  'dash.sliderAudio': '🎵 Аудио: до {n} мин',
  'dash.sliderSize': '📦 Файл: до {n} МБ',
  'dash.sliderVolume': '🔊 Громкость: {n}%',
  'dash.showSender': 'показывать имя отправителя в оверлее',
  'dash.save': 'Сохранить',
  'dash.modQueue': 'Очередь модерации',
  'dash.modEmpty': 'Пусто. Новые отправки появятся здесь сами.',
  'dash.approve': '✅ Одобрить',
  'dash.approveWhitelist': '⭐ Одобрить + автопоказ',
  'dash.reject': '❌ Отклонить',
  'dash.ban': '🔨 Бан',
  'dash.banConfirm': 'Забанить {name}? Все его отправки будут молча отклоняться.',
  'dash.thisSender': 'отправителя',
  'dash.whitelist': '⭐ Белый список',
  'dash.whitelistHint': 'играют без модерации',
  'dash.bans': '🔨 Баны',
  'dash.bansHint': 'молчаливое отклонение',
  'dash.since': 'с {date}',
  'dash.removeUser': 'убрать ✕',
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
    <div className="fixed bottom-4 right-4 z-50 flex overflow-hidden rounded-full border border-line bg-surface/90 text-xs shadow-lg backdrop-blur">
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
