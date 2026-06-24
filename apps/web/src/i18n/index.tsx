import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useMe } from '@/hooks/useMe';
import { Surface, Tooltip } from '@/ui';
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
  // Localized entry URLs (/ru, /uk) pin the language so it matches server-rendered meta.
  const p = location.pathname;
  if (p === '/uk' || p.startsWith('/uk/')) return 'uk';
  if (p === '/ru' || p.startsWith('/ru/')) return 'ru';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ru' || saved === 'uk' || saved === 'en') return saved;
  // First visit: match browser language (uk/ru), else English.
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('uk')) return 'uk';
  if (nav.startsWith('ru')) return 'ru';
  return 'en';
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

/** Localized duration from milliseconds, e.g. "15s" / "3 min 20 s". */
export function formatDuration(ms: number, t: TFn): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return t('dur.sec', { n: total });
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? t('dur.min', { n: m }) : t('dur.minSec', { m, s });
}

function LangButtons({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ['en', 'ru', 'uk'];
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
 * Floating language switcher for sidebar-less pages. Hidden for logged-in
 * streamers on sidebar routes (`/`, `/dashboard*`) where LanguageToggle handles it.
 */
export function LanguageSwitcher() {
  const { me } = useMe();
  const { pathname } = useLocation();
  const sidebarRoute = pathname === '/' || pathname.startsWith('/dashboard');
  if (me?.user && sidebarRoute) return null;
  return (
    <Surface
      variant="glass-badge"
      className="fixed bottom-4 right-4 z-50 rounded-full p-1 shadow-2"
    >
      <LangButtons />
    </Surface>
  );
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  return <LangButtons className={className} />;
}

/**
 * Compact cycle button for narrow panels (md rail, mobile header).
 * `tip` — tooltip side (use 'right' for the collapsed sidebar).
 */
export function LanguageToggleCycle({
  className = '',
  tip,
}: {
  className?: string;
  tip?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const { lang, setLang } = useI18n();
  const order: Lang[] = ['en', 'ru', 'uk'];
  const next = order[(order.indexOf(lang) + 1) % order.length]!;
  const btn = (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={`Switch language to ${next.toUpperCase()}`}
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted label-mono outline-none transition-[color,background-color,border-color] duration-[180ms] ease-out hover:border-border-strong hover:text-text focus-visible:[box-shadow:var(--shadow-focus)] ${className}`}
    >
      {/* Negative margin cancels label-mono's trailing letter-spacing, which
          otherwise shifts the text left of true center under justify-center. */}
      <span className="[margin-right:calc(var(--tracking-label)*-1)]">{lang.toUpperCase()}</span>
    </button>
  );
  return tip ? (
    <Tooltip
      content={`${lang.toUpperCase()} → ${next.toUpperCase()}`}
      placement={tip}
      focusable={false}
    >
      {btn}
    </Tooltip>
  ) : (
    btn
  );
}
