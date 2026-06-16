import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { dicts, en, type Lang, type Params } from './dictionaries';

export type { Lang } from './dictionaries';

const STORAGE_KEY = 'tmw_lang';

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
