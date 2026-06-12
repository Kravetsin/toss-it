/**
 * Сквозной тест фаз 2–3 против работающего dev-сервера (127.0.0.1:3000).
 * Серверу нужны fake-авторизация и короткий кулдаун:
 *   VIEWER_COOLDOWN_MS=1000 ALLOW_FAKE_AUTH=1 pnpm --filter @tmw/server dev
 *
 * Запуск: pnpm --filter @tmw/server exec tsx scripts/e2e.ts
 */
import { readFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import type {
  ChannelSelf,
  ListedUser,
  MediaPlayPayload,
  SubmissionSummary,
  UploadResponse,
} from '@tmw/shared';

const SERVER = process.env.E2E_SERVER ?? 'http://127.0.0.1:3000';
const COOLDOWN_WAIT_MS = 1200; // чуть больше VIEWER_COOLDOWN_MS=1000

// Уникальные логины на каждый прогон — тест идемпотентен.
const RUN = Date.now().toString(36);
const STREAMER = `e2e_s_${RUN}`;
const VIEWER = `e2e_v_${RUN}`;
const BAD_VIEWER = `e2e_b_${RUN}`;

function fail(msg: string): never {
  console.error('FAIL:', msg);
  process.exit(1);
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) fail(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

setTimeout(() => fail('общий таймаут 90с'), 90_000).unref();

async function fakeLogin(login: string): Promise<string> {
  const res = await fetch(`${SERVER}/api/auth/login?fake=${login}`, { redirect: 'manual' });
  assert(res.status === 302, `fake login ${login}: ожидал 302, получил ${res.status}`);
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert(setCookie !== undefined, 'нет cookie sid после логина');
  return setCookie.split(';')[0]!;
}

// --- 1. Стример: логин + канал ---
const streamerCookie = await fakeLogin(STREAMER);
const createRes = await fetch(`${SERVER}/api/channels`, {
  method: 'POST',
  headers: { cookie: streamerCookie },
});
assert(createRes.status === 201, `создание канала: ожидал 201, получил ${createRes.status}`);
const { overlayToken } = (await createRes.json()) as ChannelSelf;
console.log('1. стример залогинен, канал создан');

// --- 2. Оверлей + дашборд подключаются по токену ---
const plays: MediaPlayPayload[] = [];
const moderationNew: SubmissionSummary[] = [];
const moderationResolved: string[] = [];

const overlaySocket = io(SERVER, { query: { role: 'overlay', token: overlayToken } });
overlaySocket.on('media:play', (p: MediaPlayPayload) => plays.push(p));

const dashSocket = io(SERVER, { query: { role: 'dashboard', token: overlayToken } });
dashSocket.on('moderation:new', (s: SubmissionSummary) => moderationNew.push(s));
dashSocket.on('moderation:resolved', (id: string) => moderationResolved.push(id));

async function waitFor(pred: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return;
    await sleep(100);
  }
  fail(`не дождался: ${what}`);
}

await waitFor(() => overlaySocket.connected && dashSocket.connected, 'подключение сокетов');
console.log('2. оверлей и дашборд подключены по токену');

const badSocket = io(SERVER, { query: { role: 'overlay', token: 'bogus' } });
let badDisconnected = false;
badSocket.on('disconnect', () => (badDisconnected = true));
await waitFor(() => badDisconnected, 'отключение bogus-токена');
badSocket.close();
console.log('3. невалидный токен оверлея отключается сервером');

// --- 3. Аплоады: хелпер ---
async function upload(cookie: string | null, filePath: string, type: string, name: string) {
  const buf = await readFile(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  const res = await fetch(`${SERVER}/api/c/${STREAMER}/upload`, {
    method: 'POST',
    body: fd,
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, body: (await res.json()) as UploadResponse & { error?: string } };
}

const anon = await upload(null, 'scripts/fixtures/frame.png', 'image/png', 'frame.png');
assert(anon.status === 401, `аплоад без логина должен дать 401, получил ${anon.status}`);
console.log('4. аплоад без логина отклонён (401)');

// --- 4. Новичок → pending → модерация ---
const viewerCookie = await fakeLogin(VIEWER);
const first = await upload(viewerCookie, 'scripts/fixtures/frame.png', 'image/png', 'frame.png');
assert(first.status === 201, `первый аплоад: ожидал 201, получил ${first.status}`);
assert(first.body.status === 'pending', `новичок должен попасть в pending, получил ${first.body.status}`);
await waitFor(
  () => moderationNew.some((s) => s.id === first.body.id),
  'moderation:new в дашборде',
);
assert(plays.length === 0, 'pending не должен играть до одобрения');

const pendingList = (await (
  await fetch(`${SERVER}/api/dashboard/pending`, { headers: { cookie: streamerCookie } })
).json()) as SubmissionSummary[];
assert(
  pendingList.some((s) => s.id === first.body.id),
  'отправка не появилась в GET /api/dashboard/pending',
);
console.log('5. отправка новичка ушла в pending, дашборд получил live-событие');

// --- 5. Одобрение + белый список ---
const approveRes = await fetch(`${SERVER}/api/dashboard/submissions/${first.body.id}/approve`, {
  method: 'POST',
  headers: { cookie: streamerCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ whitelist: true }),
});
assert(approveRes.status === 200, `approve: ожидал 200, получил ${approveRes.status}`);
await waitFor(() => plays.some((p) => p.submissionId === first.body.id), 'media:play после одобрения');
await waitFor(() => moderationResolved.includes(first.body.id), 'moderation:resolved');
overlaySocket.emit('playback:done', first.body.id);
console.log('6. одобрено: проиграно в оверлее, дашборд получил resolved');

// --- 6. Белый список → автопоказ ---
await sleep(COOLDOWN_WAIT_MS);
const second = await upload(
  viewerCookie,
  'scripts/fixtures/video20.mp4',
  'video/mp4',
  'video20.mp4',
);
assert(second.status === 201, `второй аплоад: ожидал 201, получил ${second.status}`);
assert(
  second.body.status === 'approved',
  `из белого списка должно быть approved, получил ${second.body.status}`,
);
assert(second.body.durationMs === 15_000, `видео 20с должно обрезаться до 15с`);
await waitFor(() => plays.some((p) => p.submissionId === second.body.id), 'автопоказ из белого списка');
overlaySocket.emit('playback:done', second.body.id);
console.log('7. зритель из белого списка играет без модерации (и видео обрезано)');

// --- 7. Кулдаун ---
const tooFast = await upload(viewerCookie, 'scripts/fixtures/frame.png', 'image/png', 'frame.png');
assert(tooFast.status === 429, `кулдаун должен дать 429, получил ${tooFast.status}`);
console.log('8. повторная отправка раньше кулдауна отклонена (429)');

// --- 8. Бан: молчаливое отклонение ---
const badCookie = await fakeLogin(BAD_VIEWER);
const badFirst = await upload(badCookie, 'scripts/fixtures/frame.png', 'image/png', 'frame.png');
assert(badFirst.body.status === 'pending', 'отправка перед баном должна быть pending');
await waitFor(() => moderationNew.some((s) => s.id === badFirst.body.id), 'moderation:new для бана');

const rejectRes = await fetch(
  `${SERVER}/api/dashboard/submissions/${badFirst.body.id}/reject`,
  {
    method: 'POST',
    headers: { cookie: streamerCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ ban: true }),
  },
);
assert(rejectRes.status === 200, `reject: ожидал 200, получил ${rejectRes.status}`);
await waitFor(() => moderationResolved.includes(badFirst.body.id), 'resolved после reject');

await sleep(COOLDOWN_WAIT_MS);
const newCountBefore = moderationNew.length;
const banned = await upload(badCookie, 'scripts/fixtures/frame.png', 'image/png', 'frame.png');
assert(banned.status === 201, `бан должен выглядеть как успех (201), получил ${banned.status}`);
assert(banned.body.status === 'pending', 'бан маскируется под pending');
assert(banned.body.durationMs === 0, 'молчаливый отказ: файл не обрабатывался');
await sleep(800);
assert(moderationNew.length === newCountBefore, 'отправка забаненного не должна попадать в модерацию');
console.log('9. забаненный получает фейковый «успех», в модерацию ничего не падает');

// --- 9. Списки ---
const wl = (await (
  await fetch(`${SERVER}/api/dashboard/whitelist`, { headers: { cookie: streamerCookie } })
).json()) as ListedUser[];
assert(wl.some((u) => u.login === VIEWER), 'зритель не появился в белом списке');
const bl = (await (
  await fetch(`${SERVER}/api/dashboard/bans`, { headers: { cookie: streamerCookie } })
).json()) as ListedUser[];
assert(bl.some((u) => u.login === BAD_VIEWER), 'плохой зритель не появился в банах');
console.log('10. белый список и баны отдаются с именами пользователей');

// --- 10. Мусор по-прежнему отклоняется ---
const junk = await upload(streamerCookie, 'scripts/fixtures/junk.txt', 'video/mp4', 'fake.mp4');
assert(junk.status === 415, `мусор должен дать 415, получил ${junk.status}`);
console.log('11. текстовый файл под видом mp4 отклонён (415)');

console.log('PASS: все проверки фаз 2–3 прошли');
// Без process.exit: на Windows он роняет libuv при живых сокетах.
overlaySocket.close();
dashSocket.close();
