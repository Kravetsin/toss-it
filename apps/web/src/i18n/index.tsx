import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useMe } from '@/hooks/useMe';
import { Surface } from '@/ui';
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

/** Сегментированные кнопки EN/RU — общая начинка плавающего свитчера и инлайн-тоггла. */
function LangButtons({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ['en', 'ru'];
  return (
    <div className={`flex gap-0.5 ${className}`}>
      {langs.map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            className={`flex-1 cursor-pointer rounded-full px-3 py-1.5 label-mono outline-none transition-[color,background-color] duration-[180ms] ease-out focus-visible:[box-shadow:var(--shadow-focus)] ${
              active ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Плавающий переключатель языка (правый нижний угол) для страниц без сайдбара:
 * вход/лендинг, страница зрителя, утилитарные экраны. У залогиненного стримера на
 * маршрутах с сайдбаром (`/`, `/dashboard`) он живёт в сайдбаре (LanguageToggle),
 * иначе перекрывал бы контент (напр. кнопку Save в настройках).
 */
export function LanguageSwitcher() {
  const { me } = useMe();
  const { pathname } = useLocation();
  const sidebarRoute = pathname === '/' || pathname === '/dashboard';
  if (me?.user && sidebarRoute) return null;
  return (
    <Surface variant="glass-badge" className="fixed bottom-4 right-4 z-50 rounded-full p-1 shadow-2">
      <LangButtons />
    </Surface>
  );
}

/** Инлайн-переключатель языка для сайдбара/мобильной панели залогиненного стримера. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  return <LangButtons className={className} />;
}
