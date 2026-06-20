import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { db } from './db/index';
import { channels, users } from './db/schema';
import { config } from './config';

/**
 * Server-side SEO для SPA: один и тот же index.html, но <head> (title/description/OG/
 * canonical/robots/JSON-LD) и «первая волна» контента в #root подставляются под маршрут.
 * Нужно потому, что чистый Vite-SPA отдаёт пустой каркас — без этого Google/AI-краулеры
 * не понимают, что за бренд, а главная не попадает в индекс.
 *
 * Бренд: видимое имя — «Tossit», но домен/запрос — «toss-it». Связываем их через
 * alternateName в JSON-LD, чтобы поисковик считал это одной сущностью.
 */

const SITE_NAME = 'Tossit';
const DEFAULT_TITLE = 'Tossit — submissions inbox for streamers';
const DEFAULT_DESC =
  'Tossit — a submissions inbox for streamers. Viewers send images, GIFs, videos and sounds straight to your stream, with moderation, a whitelist and limits.';

/** Блок-маркер в index.html, который целиком заменяется на мета конкретного маршрута. */
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
  /** Канонический путь (без домена), например '/' или '/c/login'. */
  path: string;
  /** index,follow vs noindex,follow. */
  index: boolean;
  /** «Первая волна» — статический контент в #root для краулеров без JS (React его заменит). */
  bodyHtml?: string;
  /** HTTP-статус (404 для несуществующего канала — иначе soft-404). */
  status?: number;
}

/** Глобальная сущность бренда. Без пользовательских данных — безопасно в ld+json. */
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
  // Экранируем '<' на случай, если когда-нибудь в данные попадёт ввод — защита от выхода из <script>.
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
  if (m.index) lines.push(jsonLd());
  return lines.join('\n    ');
}

const FALLBACK_WRAP =
  'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0d1111;color:#e6edf0;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:40px;box-sizing:border-box';

function homeBody(): string {
  return (
    `<div style="${FALLBACK_WRAP}">` +
    `<img src="/favicon.svg" width="72" height="72" alt="Tossit logo" />` +
    `<h1 style="font-size:40px;margin:0">Tossit</h1>` +
    `<p style="max-width:520px;color:#9fb0b5;margin:0;line-height:1.5">Viewers send images, GIFs, videos and sounds straight to your stream — with moderation, a whitelist and limits.</p>` +
    `<p style="color:#5b6b70;font-size:14px;margin:0">How it works: upload → processing → moderation → on stream</p>` +
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

/** Маршрут → мета. /c/:login требует запроса в БД (имя канала + настоящий 404). */
async function resolve(url: string): Promise<PageMeta> {
  const pathname = url.split('?')[0]!.split('#')[0]!;

  if (pathname === '/' || pathname === '') {
    return { title: DEFAULT_TITLE, description: DEFAULT_DESC, path: '/', index: true, bodyHtml: homeBody() };
  }

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

  // Дашборд/админка/промо/инвайты/прочее — служебное, в индекс не пускаем.
  return { title: DEFAULT_TITLE, description: DEFAULT_DESC, path: pathname, index: false };
}

function render(template: string, m: PageMeta): string {
  const head = buildHead(m);
  let html = SEO_BLOCK.test(template)
    ? template.replace(SEO_BLOCK, head)
    : template.replace(/<title>[\s\S]*?<\/title>/, head);
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

/** Кэш sitemap: список каналов меняется редко, не дёргаем БД на каждый запрос краулера. */
let sitemapCache: { xml: string; at: number } = { xml: '', at: 0 };

async function sitemapXml(): Promise<string> {
  const now = Date.now();
  if (sitemapCache.xml && now - sitemapCache.at < 10 * 60_000) return sitemapCache.xml;
  const rows = await db
    .select({ login: users.login })
    .from(channels)
    .innerJoin(users, eq(users.id, channels.ownerUserId))
    .all();
  const locs = [base() + '/', ...rows.map((r) => `${base()}/c/${r.login}`)];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    locs.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  sitemapCache = { xml, at: now };
  return xml;
}

/**
 * Регистрирует robots.txt, sitemap.xml и SPA-fallback с подстановкой мета.
 * Вызывать ПОСЛЕ регистрации статики и только когда сервер сам раздаёт фронт.
 */
export function registerSeo(app: FastifyInstance, webDist: string): void {
  const template = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');

  app.get('/robots.txt', async (_req, reply) =>
    reply.type('text/plain; charset=utf-8').send(robotsTxt()),
  );

  app.get('/sitemap.xml', async (_req, reply) =>
    reply.type('application/xml; charset=utf-8').send(await sitemapXml()),
  );

  const serve = async (reply: FastifyReply, url: string) => {
    const meta = await resolve(url);
    return reply
      .code(meta.status ?? 200)
      .type('text/html; charset=utf-8')
      .send(render(template, meta));
  };

  // Главная: fastify-static с index:false отдаёт на корень '/' статус 403 и НЕ доходит до
  // notFoundHandler — поэтому '/' обслуживаем явным маршрутом (точный путь приоритетнее
  // wildcard-статики). Это и был баг «главная без мета».
  app.get('/', async (_req, reply) => serve(reply, '/'));

  // SPA-fallback: всё прочее, что не статика и не /api|/socket.io — index.html с мета под маршрут.
  app.setNotFoundHandler(async (req, reply) => {
    const url = req.raw.url ?? '';
    if (req.method === 'GET' && !url.startsWith('/api') && !url.startsWith('/socket.io')) {
      return serve(reply, url);
    }
    return reply.code(404).send({ error: 'Не найдено' });
  });
}
