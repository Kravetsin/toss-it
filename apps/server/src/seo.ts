import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { db } from './db/index';
import { channels, users } from './db/schema';
import { config } from './config';

/**
 * Server-side SEO for the SPA: same index.html, but <head> meta and a first-paint #root
 * body are injected per route, since a bare Vite SPA ships an empty shell crawlers can't index.
 * Brand: visible name "Tossit" vs domain "toss-it" — linked via alternateName so search
 * engines treat them as one entity.
 */

const SITE_NAME = 'Tossit';
const DEFAULT_TITLE = 'Tossit — submissions inbox for streamers';
const DEFAULT_DESC =
  'Tossit — a submissions inbox for streamers. Viewers send images, GIFs, videos and sounds straight to your stream, with moderation, a whitelist and limits.';

type Lang = 'en' | 'ru' | 'uk';

// Localized home pages live at distinct URLs (/, /ru, /uk) so each is crawlable and hreflang-linked
// — Google indexes that far better than Accept-Language dynamic serving. Copy is data, like i18n.
const LOCALES: Record<
  Lang,
  { path: string; ogLocale: string; title: string; desc: string; tagline: string; how: string }
> = {
  en: {
    path: '/',
    ogLocale: 'en_US',
    title: DEFAULT_TITLE,
    desc: DEFAULT_DESC,
    tagline:
      'Viewers send images, GIFs, videos and sounds straight to your stream — with moderation, a whitelist and limits.',
    how: 'How it works: upload → processing → moderation → on stream',
  },
  ru: {
    path: '/ru',
    ogLocale: 'ru_RU',
    title: 'Tossit — предложка для стримеров',
    desc: 'Tossit — предложка для стримеров: зрители отправляют картинки, гифки, видео и звуки прямо на твой стрим, с модерацией, белым списком и лимитами.',
    tagline:
      'Зрители отправляют картинки, гифки, видео и звуки прямо на твой стрим — с модерацией, белым списком и лимитами.',
    how: 'Как это работает: загрузка → обработка → модерация → на стриме',
  },
  uk: {
    path: '/uk',
    ogLocale: 'uk_UA',
    title: 'Tossit — предложка для стрімерів',
    desc: 'Tossit — предложка для стрімерів: глядачі надсилають картинки, GIF, відео та звуки прямо на твій стрім, з модерацією, білим списком і лімітами.',
    tagline:
      'Глядачі надсилають картинки, GIF, відео та звуки прямо на твій стрім — з модерацією, білим списком і лімітами.',
    how: 'Як це працює: завантаження → обробка → модерація → у ефірі',
  },
};

// Reciprocal hreflang cluster for the home pages (x-default → English).
const HOME_HREFLANG: ReadonlyArray<{ lang: string; path: string }> = [
  { lang: 'en', path: '/' },
  { lang: 'ru', path: '/ru' },
  { lang: 'uk', path: '/uk' },
  { lang: 'x-default', path: '/' },
];

/** Marker block in index.html, replaced wholesale with the route's meta. */
const SEO_BLOCK = /<!--SEO-->[\s\S]*?<!--\/SEO-->/;
const ROOT_DIV = '<div id="root"></div>';

function base(): string {
  return config.webUrl.replace(/\/+$/, '');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface PageMeta {
  title: string;
  description: string;
  /** Canonical path without domain, e.g. '/' or '/c/login'. */
  path: string;
  /** index,follow vs noindex,follow. */
  index: boolean;
  /** First-paint #root content for no-JS crawlers (React replaces it). */
  bodyHtml?: string;
  /** HTTP status (404 for a missing channel, else soft-404). */
  status?: number;
  /** Page language for <html lang> and og:locale; defaults to en. */
  lang?: Lang;
  ogLocale?: string;
  /** hreflang alternates to emit (home pages). */
  alternates?: ReadonlyArray<{ lang: string; path: string }>;
}

/** Global brand entity. No user data, so safe to emit as ld+json. */
function jsonLd(): string {
  const url = base() + '/';
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      alternateName: ['Toss-It', 'toss-it', 'toss it'],
      url,
      logo: base() + '/favicon.svg',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: ['Toss-It', 'toss-it'],
      url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      alternateName: ['Toss-It', 'toss-it'],
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web',
      url,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ];
  // Escape '<' in case user input ever enters data — prevents breaking out of <script>.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function buildHead(m: PageMeta): string {
  const url = base() + m.path;
  const ogImage = base() + '/og-image.png';
  const robots = m.index ? 'index,follow' : 'noindex,follow';
  const t = esc(m.title);
  const d = esc(m.description);
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ];
  if (m.ogLocale) lines.push(`<meta property="og:locale" content="${m.ogLocale}" />`);
  for (const a of m.alternates ?? []) {
    lines.push(`<link rel="alternate" hreflang="${a.lang}" href="${esc(base() + a.path)}" />`);
  }
  if (m.index) lines.push(jsonLd());
  return lines.join('\n    ');
}

const FALLBACK_WRAP =
  'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0d1111;color:#e6edf0;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:40px;box-sizing:border-box';

// Crawlable internal links to the language variants: gives Googlebot a path to /ru and /uk
// from the homepage (the page it actually crawls), independent of the sitemap.
const LANG_LINKS =
  `<p style="margin:0;color:#5b6b70;font-size:13px">` +
  `<a href="/" style="color:#8df0cc">English</a> · ` +
  `<a href="/ru" style="color:#8df0cc">Русский</a> · ` +
  `<a href="/uk" style="color:#8df0cc">Українська</a>` +
  `</p>`;

function homeBody(lang: Lang): string {
  const L = LOCALES[lang];
  return (
    `<div style="${FALLBACK_WRAP}">` +
    `<img src="/favicon.svg" width="72" height="72" alt="Tossit logo" />` +
    `<h1 style="font-size:40px;margin:0">Tossit</h1>` +
    `<p style="max-width:520px;color:#9fb0b5;margin:0;line-height:1.5">${esc(L.tagline)}</p>` +
    `<p style="color:#5b6b70;font-size:14px;margin:0">${esc(L.how)}</p>` +
    LANG_LINKS +
    `</div>`
  );
}

function channelBody(name: string): string {
  const n = esc(name);
  return (
    `<div style="${FALLBACK_WRAP}">` +
    `<h1 style="font-size:32px;margin:0">${n}</h1>` +
    `<p style="max-width:520px;color:#9fb0b5;margin:0;line-height:1.5">Send images, GIFs, videos and sounds to ${n}'s stream — moderated, with limits. Powered by Tossit.</p>` +
    `</div>`
  );
}

/** Route to meta. /c/:login hits the DB for the channel name and a real 404. */
async function resolve(url: string): Promise<PageMeta> {
  const pathname = url.split('?')[0]!.split('#')[0]!;

  const homeFor = (lang: Lang): PageMeta => {
    const L = LOCALES[lang];
    return {
      title: L.title,
      description: L.desc,
      path: L.path,
      index: true,
      bodyHtml: homeBody(lang),
      lang,
      ogLocale: L.ogLocale,
      alternates: HOME_HREFLANG,
    };
  };

  if (pathname === '/' || pathname === '') return homeFor('en');
  if (pathname === '/ru' || pathname === '/ru/') return homeFor('ru');
  if (pathname === '/uk' || pathname === '/uk/') return homeFor('uk');

  const ch = pathname.match(/^\/c\/([^/]+)\/?$/);
  if (ch) {
    const login = decodeURIComponent(ch[1]!).toLowerCase();
    const row = await db
      .select({ login: users.login, displayName: users.displayName })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(users.login, login))
      .get();
    if (!row) {
      return {
        title: 'Channel not found — Tossit',
        description: DEFAULT_DESC,
        path: pathname,
        index: false,
        status: 404,
      };
    }
    const name = row.displayName || row.login;
    return {
      title: `Send media to ${name} — Tossit`,
      description: `Send images, GIFs, videos and sounds to ${name}'s stream via Tossit — with moderation and limits.`,
      path: `/c/${row.login}`,
      index: true,
      bodyHtml: channelBody(name),
    };
  }

  // Dashboard/admin/promo/invites/etc are internal — keep out of the index.
  return { title: DEFAULT_TITLE, description: DEFAULT_DESC, path: pathname, index: false };
}

function render(template: string, m: PageMeta): string {
  const head = buildHead(m);
  let html = SEO_BLOCK.test(template)
    ? template.replace(SEO_BLOCK, head)
    : template.replace(/<title>[\s\S]*?<\/title>/, head);
  if (m.lang && m.lang !== 'en') html = html.replace(/<html lang="[^"]*">/, `<html lang="${m.lang}">`);
  if (m.bodyHtml) html = html.replace(ROOT_DIV, `<div id="root">${m.bodyHtml}</div>`);
  return html;
}

function robotsTxt(): string {
  return [
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /overlay/',
    'Disallow: /dashboard',
    'Disallow: /admin',
    'Disallow: /promo',
    'Disallow: /mod-invite',
    'Disallow: /_gallery',
    '',
    `Sitemap: ${base()}/sitemap.xml`,
    '',
  ].join('\n');
}

// llms.txt (llmstxt.org): a Markdown brief for AI agents — needs an H1 and links.
function llmsTxt(): string {
  const b = base();
  return [
    '# Tossit',
    '',
    '> A submissions inbox for streamers (a "предложка"): viewers send images, GIFs, videos and sounds straight to a streamer\'s stream, with moderation, a whitelist and limits. Platform-agnostic — Twitch, Kick, YouTube.',
    '',
    '## Pages',
    '',
    `- [Home](${b}/): what Tossit is and how to get started.`,
    `- [Главная — RU](${b}/ru): предложка для стримеров.`,
    `- [Головна — UK](${b}/uk): предложка для стрімерів.`,
    '',
    '## How it works',
    '',
    "- A viewer opens a streamer's link (/c/<login>), uploads media, it passes moderation, then plays in the streamer's OBS overlay.",
    '',
  ].join('\n');
}

/** Sitemap cache: channel list rarely changes, avoid a DB hit per crawler request. */
let sitemapCache: { xml: string; at: number } = { xml: '', at: 0 };

async function sitemapXml(): Promise<string> {
  const now = Date.now();
  if (sitemapCache.xml && now - sitemapCache.at < 10 * 60_000) return sitemapCache.xml;
  const rows = await db
    .select({ login: users.login })
    .from(channels)
    .innerJoin(users, eq(users.id, channels.ownerUserId))
    .all();
  const locs = [
    base() + '/',
    base() + '/ru',
    base() + '/uk',
    ...rows.map((r) => `${base()}/c/${r.login}`),
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    locs.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  sitemapCache = { xml, at: now };
  return xml;
}

/**
 * Registers robots.txt, sitemap.xml and the SPA fallback with meta injection.
 * Call AFTER static registration and only when the server serves the frontend itself.
 */
export function registerSeo(app: FastifyInstance, webDist: string): void {
  const template = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');

  // Cache-Control lets Cloudflare cache these at the edge, so a brief origin (laptop)
  // outage doesn't make Googlebot's fetch fail. Needs a Cloudflare cache rule too.
  const CACHE = 'public, max-age=3600';

  app.get('/robots.txt', async (_req, reply) =>
    reply.header('cache-control', CACHE).type('text/plain; charset=utf-8').send(robotsTxt()),
  );

  app.get('/llms.txt', async (_req, reply) =>
    reply.header('cache-control', CACHE).type('text/markdown; charset=utf-8').send(llmsTxt()),
  );

  app.get('/sitemap.xml', async (_req, reply) =>
    reply.header('cache-control', CACHE).type('application/xml; charset=utf-8').send(await sitemapXml()),
  );

  const serve = async (reply: FastifyReply, url: string) => {
    const meta = await resolve(url);
    return reply
      .code(meta.status ?? 200)
      .type('text/html; charset=utf-8')
      .send(render(template, meta));
  };

  // Home: fastify-static with index:false returns 403 on '/' and never reaches the
  // notFoundHandler, so serve '/' via an explicit route (exact path beats wildcard static).
  app.get('/', async (_req, reply) => serve(reply, '/'));

  // SPA fallback: anything non-static and not /api|/socket.io gets index.html with route meta.
  app.setNotFoundHandler(async (req, reply) => {
    const url = req.raw.url ?? '';
    if (req.method === 'GET' && !url.startsWith('/api') && !url.startsWith('/socket.io')) {
      return serve(reply, url);
    }
    return reply.code(404).send({ error: 'Не найдено' });
  });
}
