import { useEffect, useRef, useState } from 'react';
import type {
  EquippedCosmetics,
  LeaderboardEntry,
  LiveStatus,
  SubmissionSummary,
  UploadResponse,
} from '@tmw/shared';
import { COSMETICS, cosmeticModule, entranceModule, particleCount } from '@tmw/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  CornerFrame,
  Icon,
  IconButton,
  Input,
  Loader,
  ProgressBar,
  Select,
  Surface,
  Textarea,
  Tooltip,
} from '@/ui';
import type { IconName } from '@/ui/icons';
import { useI18n } from '@/i18n';
import { LeaderboardRow } from '@/features/channel/components/Leaderboard';
import { SubmissionCard } from '@/features/dashboard/components/SubmissionCard';
import { ComposeForm } from '@/features/channel/components/ComposeForm';
import { Vessel } from '@/features/channel/components/Vessel/Vessel';
import type { Phase } from '@/features/channel/hooks/useMediaSubmission';

/**
 * Design system reference gallery for Phase 0 development. Agents in Phase 1 use this
 * to verify component specs match the baseline.
 */

const COLORS: { name: string; cls: string; border?: boolean }[] = [
  { name: 'bg', cls: 'bg-bg', border: true },
  { name: 'bg-elevated', cls: 'bg-bg-elevated' },
  { name: 'surface', cls: 'bg-surface' },
  { name: 'surface-2', cls: 'bg-surface-2' },
  { name: 'border', cls: 'bg-border' },
  { name: 'border-strong', cls: 'bg-border-strong' },
  { name: 'text', cls: 'bg-text' },
  { name: 'muted', cls: 'bg-muted' },
  { name: 'faint', cls: 'bg-faint' },
  { name: 'accent', cls: 'bg-accent' },
  { name: 'accent-hover', cls: 'bg-accent-hover' },
  { name: 'ok', cls: 'bg-ok' },
  { name: 'warn', cls: 'bg-warn' },
  { name: 'danger', cls: 'bg-danger' },
  { name: 'info', cls: 'bg-info' },
];

const ICONS: IconName[] = [
  'folder-plus',
  'send',
  'upload',
  'clock',
  'check',
  'close',
  'monitor',
  'trophy',
  'volume-1',
  'volume-2',
  'volume-3',
  'volume-x',
  'gift',
  'sparkles',
  'star',
  'image',
  'loader',
  'reload',
  'copy',
  'user-x',
  'forward',
  'bell',
  'bell-off',
  'shield',
  'eye',
  'home',
  'save',
  'play',
  'pause',
  'square-alert',
  'fullscreen',
  'fullscreen-exit',
  'swap',
  'twitch',
  'google',
];

const BTN_VARIANTS = ['primary', 'framed', 'accent', 'secondary', 'ghost', 'danger'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="label-mono text-muted">{title}</h2>
      {children}
    </section>
  );
}

const DEMO_RESULT: UploadResponse = {
  id: 'demo',
  status: 'pending',
  durationMs: 0,
  queuePosition: 1,
  cooldownSec: 60,
  stardustBalance: 0,
};

/**
 * Test benches for card + nick cosmetics: the REAL components a viewer's cosmetics land in, driven
 * by one switch, at the width their own page gives them.
 *
 * Real components, not lookalikes, and that is the whole point. A hand-built stand-in drifts from
 * the thing it stands for the first time either is touched, and then it lies exactly when you trust
 * it. It also cannot reproduce what actually breaks: the feed card here EXPANDS, which is where a
 * particle layer stops covering the box it grew into (see the `%`-vs-`cqh` note in the effects).
 *
 * The two overlay surfaces are deliberately absent: they are built with document.createElement in
 * apps/overlay against their own CSS, so a React copy of them here would be a fake — which is the
 * one thing this section exists not to be. They have their own demos; the links point there.
 */
const BENCH_WIDTH = {
  /** Dashboard queue column. */
  feed: 520,
  /** Channel page is PageShell maxWidth="xl" (576) minus its padding — the row is far narrower
   *  than this gallery, and a swarm judged at gallery width is judged at the wrong density. */
  channel: 544,
};

const DEMO_SUBMISSION: SubmissionSummary = {
  id: 'bench',
  senderUserId: 'twitch:bench',
  senderName: 'thunderstruck',
  senderColor: null,
  senderColor2: null,
  senderNickFlow: false,
  senderEffect: null,
  senderCardEffect: null,
  senderSeal: null,
  senderFrame: null,
  senderLevel: 8,
  kind: 'text',
  mime: 'text/plain',
  text: 'бахнуло знатно, го смотреть',
  durationMs: 6000,
  createdAt: Date.now(),
  url: '',
};

const DEMO_ENTRY: LeaderboardEntry = {
  userId: 'twitch:bench',
  login: 'thunderstruck',
  displayName: 'thunderstruck',
  value: 12,
  isFounder: false,
  nickColor: null,
  nickColor2: null,
  nickFlow: false,
  nickEffect: null,
  cardEffect: null,
  seal: null,
  level: 8,
};

function Bench({
  label,
  hint,
  width,
  children,
}: {
  label: string;
  hint: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="label-mono text-muted">{label}</span>
        <span className="text-sm text-faint">{hint}</span>
      </div>
      {/* The real page's width, not the gallery's: density reads wrong at any other. */}
      <div style={{ maxWidth: width }}>{children}</div>
    </div>
  );
}

function CosmeticsShowcase() {
  const { t } = useI18n();
  // Straight from the registry, so a new cosmetic shows up here the day it is registered and nobody
  // has to remember this page exists.
  const cardEffects = COSMETICS.filter((c) => c.type === 'card_effect');
  const nickEffects = COSMETICS.filter((c) => c.type === 'nick_effect');
  const [effect, setEffect] = useState(cardEffects[0]?.id ?? '');
  const [nickEffect, setNickEffect] = useState('');
  const [color, setColor] = useState('#8df0cc');
  const [color2, setColor2] = useState('#a78bfa');
  const [gradient, setGradient] = useState(false);
  const [flow, setFlow] = useState(false);
  // Remounts the benches, so a re-roll gives fresh particles — the swarm is randomised per mount.
  const [roll, setRoll] = useState(0);

  const label = (id: string) => t(cosmeticModule(id)?.labels.name ?? id);
  const cosmetics: EquippedCosmetics = {
    nickColor: color,
    nickColor2: gradient ? color2 : null,
    nickFlow: gradient && flow,
    nickEffect: nickEffect || null,
    cardEffect: effect,
  };
  // The same cosmetics, in the shape a submission carries them.
  const submission: SubmissionSummary = {
    ...DEMO_SUBMISSION,
    senderColor: color,
    senderColor2: gradient ? color2 : null,
    senderNickFlow: gradient && flow,
    senderEffect: nickEffect || null,
    senderCardEffect: effect,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={effect}
          onChange={setEffect}
          options={cardEffects.map((e) => ({ value: e.id, label: label(e.id) }))}
          label="Card effect"
        />
        <Select
          value={nickEffect}
          onChange={setNickEffect}
          options={[{ value: '', label: '— no nick effect —' }].concat(
            nickEffects.map((e) => ({ value: e.id, label: label(e.id) })),
          )}
          label="Nick effect"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Nick color"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
        />
        {gradient && (
          <input
            type="color"
            value={color2}
            onChange={(e) => setColor2(e.target.value)}
            aria-label="Second color"
            className="h-9 w-12 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
          />
        )}
        <Button
          variant={gradient ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => setGradient((g) => !g)}
        >
          Gradient
        </Button>
        <Button
          variant={flow ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => setFlow((f) => !f)}
          disabled={!gradient}
        >
          Flow
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRoll((r) => r + 1)}>
          Re-roll swarm
        </Button>
      </div>

      <div key={`${effect}-${nickEffect}-${roll}`} className="flex flex-col gap-6">
        <Bench
          label="Feed card"
          hint={`dashboard queue · ${BENCH_WIDTH.feed}px · ${particleCount(effect, 'web')} particles · CLICK IT — the layer must grow with the card`}
          width={BENCH_WIDTH.feed}
        >
          <SubmissionCard
            s={submission}
            onApprove={() => {}}
            onTrust={() => {}}
            onReject={() => {}}
            onBan={() => {}}
          />
        </Bench>

        <Bench
          label="Leaderboard row"
          hint={`channel page · ${BENCH_WIDTH.channel}px · compact · ${particleCount(effect, 'web')} particles`}
          width={BENCH_WIDTH.channel}
        >
          <Card>
            <ol className="flex flex-col gap-1.5">
              <LeaderboardRow entry={DEMO_ENTRY} rank={1} metric="sends" cosmetics={cosmetics} />
              <LeaderboardRow
                entry={{ ...DEMO_ENTRY, userId: 'twitch:you', displayName: 'you' }}
                rank={2}
                metric="sends"
                isYou
                cosmetics={cosmetics}
              />
            </ol>
          </Card>
        </Bench>

        {/* Not faked here on purpose — see the note above SHOWCASE benches. */}
        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-muted">Overlay alert & chat pill</span>
          <p className="text-sm text-faint">
            Built imperatively in apps/overlay with their own CSS — a React copy here would drift
            from the real thing. They have their own demos, and the chat pill is the smallest
            surface any effect has to survive:{' '}
            <a className="text-accent underline" href="http://localhost:5198/?demo">
              overlay alert
            </a>{' '}
            ·{' '}
            <a className="text-accent underline" href="http://localhost:5198/chat.html?demo">
              chat pill
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Entrance test bench: replay any equipped-entrance cosmetic on message blocks of three sizes,
 * against a dark OR light backdrop.
 *
 * Why this exists apart from the shop's own EntranceDemo: an entrance is a one-shot with no card to
 * sit and stare at, and the two things that actually break it aren't visible in a single fixed-size
 * pill — (1) how it reads on a tiny "гг" vs a wrapped multi-line post (the JS entrances sample the
 * block's REAL outline, so size changes what they draw), and (2) whether a light-particle effect
 * survives a bright background. The overlay demos render on white, which is exactly where a starlight
 * effect disappears — so the light/dark switch here reproduces that on purpose.
 *
 * The stage is a `translateZ(0)` containing block, so each engine's `fixed` canvas fills THIS panel
 * (not the viewport) and `overflow-hidden` clips its particles to the stage — the same "host the
 * canvas in an isolated surface, lift the block above it" trick the shop drawer uses.
 */
function EntrancesShowcase() {
  const { t } = useI18n();
  const entrances = COSMETICS.filter((c) => c.type === 'entrance' && !c.upgrade);
  const [id, setId] = useState(entrances[0]?.id ?? '');
  const [light, setLight] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const blocks = useRef<(HTMLDivElement | null)[]>([]);
  const teardowns = useRef<(() => void)[]>([]);
  const label = (cid: string) => t(cosmeticModule(cid)?.labels.name ?? cid);

  const play = () => {
    teardowns.current.forEach((f) => f());
    teardowns.current = [];
    const mod = entranceModule(id);
    if (!mod) return;
    blocks.current.forEach((el) => {
      if (!el) return;
      // Clear anything a previous run left inline, then flush it so a repeat restarts from scratch.
      el.style.opacity = '';
      el.style.filter = '';
      el.style.transform = '';
      delete el.dataset.fx;
      void el.offsetWidth;
      if (mod.play) {
        const off = mod.play(el, stageRef.current ?? undefined);
        if (typeof off === 'function') teardowns.current.push(off);
      } else {
        el.dataset.fx = mod.fx;
      }
    });
  };

  // Replay when the chosen entrance changes; tear down live JS instances on unmount.
  useEffect(() => {
    play();
    return () => {
      teardowns.current.forEach((f) => f());
      teardowns.current = [];
    };
  }, [id]);

  const bench: { hint: string; text: string }[] = [
    { hint: 'one word', text: 'гг' },
    { hint: 'one line', text: 'бахнуло знатно, го смотреть' },
    {
      hint: 'multi-line post',
      text: 'вот это поворот, я реально не ожидал — надо пересмотреть момент на записи, там явно что-то нечисто, го обсудим после стрима',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={id}
          onChange={setId}
          options={entrances.map((e) => ({ value: e.id, label: label(e.id) }))}
          label="Entrance"
        />
        <Button variant="primary" size="sm" onClick={play}>
          <Icon name="reload" size={14} />
          Replay
        </Button>
        <Button variant={light ? 'primary' : 'ghost'} size="sm" onClick={() => setLight((v) => !v)}>
          <Icon name="eye" size={14} />
          {light ? 'Светлый фон' : 'Тёмный фон'}
        </Button>
      </div>
      <p className="max-w-2xl text-sm text-faint">
        Появление — одноразовое, жми Replay. Блоки трёх размеров: эффект должен читаться и на «гг»,
        и на длинном посте (JS-появления обводят реальный контур, так что размер меняет рисунок).
        Переключи фон: светлые частицы (Астрал) на белом почти не видно — ровно как в демо-оверлеях
        над светлой сценой.
      </p>
      <div
        ref={stageRef}
        className={`relative isolate overflow-hidden rounded-[var(--radius-md)] border border-border p-6 ${light ? 'bg-white' : 'bg-[#0a0c12]'}`}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="flex flex-col items-start gap-5">
          {bench.map((b, i) => (
            <div
              key={i}
              ref={(el) => {
                blocks.current[i] = el;
              }}
              className={`relative z-[1] inline-flex max-w-[420px] items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 ${light ? 'border-black/10 bg-black/[0.04]' : 'border-white/10 bg-[#1c2029]'}`}
            >
              <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-accent/60" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-accent">stargazer_9</span>
                <span className={`text-sm ${light ? 'text-black/80' : 'text-text'}`}>{b.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VesselDemo() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [text, setText] = useState('врубай этого на стрим 🔥');
  // Token incremented on each action to cancel stale async completions.
  const tok = useRef(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec]);

  const reset = () => {
    tok.current++;
    setStatus(null);
    setCooldownSec(0);
    setPhase({ name: 'idle' });
  };
  const go = (p: Phase, st: LiveStatus | null = null, cd = 0) => {
    tok.current++;
    setPhase(p);
    setStatus(st);
    setCooldownSec(cd);
  };
  const play = () => {
    const my = ++tok.current;
    // Schedule timed action; cancelled if token changes (action interrupted).
    const at = (ms: number, fn: () => void) =>
      window.setTimeout(() => {
        if (my === tok.current) fn();
      }, ms);
    setStatus(null);
    setCooldownSec(0);
    setPhase({ name: 'uploading', progress: 0 });
    at(150, () => setPhase({ name: 'uploading', progress: 0.35 }));
    at(700, () => setPhase({ name: 'uploading', progress: 0.7 }));
    at(1300, () => setPhase({ name: 'uploading', progress: 1 }));
    at(1750, () => setPhase({ name: 'uploading', progress: null }));
    at(4200, () => {
      setPhase({ name: 'done', result: DEMO_RESULT });
      setStatus('pending');
    });
    at(5600, () => setStatus('approved'));
    at(7000, () => setStatus('playing'));
    at(9800, () => setStatus('played'));
    at(11300, () => {
      setStatus(null);
      setPhase({ name: 'idle' });
      setCooldownSec(8);
    });
  };

  const chip = (label: string, fn: () => void) => (
    <button
      onClick={fn}
      className="rounded-none border border-border px-3 py-1.5 label-mono text-muted transition-colors hover:text-text"
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={play}>
          <Icon name="play" size={14} />
          проиграть
        </Button>
        {chip('сброс', reset)}
        {chip('загрузка', () => go({ name: 'uploading', progress: 0.45 }))}
        {chip('обработка', () => go({ name: 'uploading', progress: null }))}
        {chip('модерация', () => go({ name: 'done', result: DEMO_RESULT }, 'pending'))}
        {chip('очередь', () => go({ name: 'done', result: DEMO_RESULT }, 'approved'))}
        {chip('на стриме', () => go({ name: 'done', result: DEMO_RESULT }, 'playing'))}
        {chip('показано', () => go({ name: 'done', result: DEMO_RESULT }, 'played'))}
        {chip('отклонено', () => go({ name: 'done', result: DEMO_RESULT }, 'rejected'))}
        {chip('истекло', () => go({ name: 'done', result: DEMO_RESULT }, 'expired'))}
        {chip('кулдаун 30с', () => go({ name: 'idle' }, null, 30))}
      </div>
      <div className="max-w-md">
        <Vessel phase={phase} status={status} cooldownSec={cooldownSec}>
          <ComposeForm
            file={null}
            previewUrl={null}
            text={text}
            senderName="Kravets"
            errorMessage={null}
            cooldownSec={cooldownSec}
            onPickFile={() => {}}
            onRemoveFile={() => {}}
            onTextChange={setText}
            onSend={play}
          />
        </Vessel>
      </div>
    </div>
  );
}

export function GalleryPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 p-8">
      <header className="flex flex-col gap-2">
        <span className="label-mono text-accent">&gt; FOUNDATION · PHASE 0</span>
        <h1>Motion-dark</h1>
        <p className="max-w-xl text-muted">
          Эталон дизайн-системы. Значения акцента и шрифтов провизорные. Наведи курсор на кнопки —
          уголки «выезжают», диагональная заливка вытирает фон, лейбл инвертируется.
        </p>
      </header>

      <Section title="Card effects — every surface, one switch">
        <CosmeticsShowcase />
      </Section>

      <Section title="Entrances — sizes & backgrounds">
        <EntrancesShowcase />
      </Section>

      <Section title="Vessel — отправка зрителя (Phase 4)">
        <VesselDemo />
      </Section>

      <Section title="Colors">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {COLORS.map((c) => (
            <div key={c.name} className="flex flex-col gap-1.5">
              <div
                className={`h-12 w-full rounded-none ${c.cls} ${c.border ? 'border border-border' : ''}`}
              />
              <span className="label-mono text-faint">{c.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation (shadow-1..4)">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {(['shadow-1', 'shadow-2', 'shadow-3', 'shadow-4'] as const).map((s) => (
            <div
              key={s}
              className={`grid h-20 place-items-center rounded-none border border-border bg-surface ${s}`}
            >
              <span className="label-mono text-muted">{s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <span className="label-mono text-accent">&gt; KICKER · 04 · LABEL-MONO</span>
          <h1>Heading 1 — TASA/Inter</h1>
          <h2>Heading 2 — display</h2>
          <h3>Heading 3 / kicker tier</h3>
          <p className="max-w-2xl">
            Body — Inter, negative tracking. The quick brown fox jumps over the lazy dog. Тонкая
            типографика с отрицательным трекингом для основного текста.
          </p>
          <p className="text-muted">Muted body text.</p>
          <p className="text-faint">Faint / disabled text.</p>
        </div>
      </Section>

      <Section title="Button — variants × states">
        <div className="flex flex-col gap-4">
          {BTN_VARIANTS.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-4">
              <span className="w-20 shrink-0 label-mono text-faint">{v}</span>
              <Button variant={v} size="sm">
                Small
              </Button>
              <Button variant={v}>
                <Icon name="send" size={15} />
                Default
              </Button>
              <Button variant={v} size="lg">
                Large
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-20 shrink-0 label-mono text-faint">loading</span>
            <Button variant="primary" disabled aria-busy>
              <Icon name="loader" size={15} className="animate-spin" />
              Loading
            </Button>
            <Button variant="accent" disabled aria-busy>
              <Icon name="loader" size={15} className="animate-spin" />
              Saving
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Tooltip — liquid reveal">
        <div className="flex flex-wrap items-center gap-10">
          {(['start', 'center', 'end'] as const).map((align) => (
            <Tooltip
              key={align}
              align={align}
              content={
                <span className="flex flex-col gap-1">
                  <span className="font-semibold text-text">align={align}</span>
                  <span>Заливка растёт из точки наведения — буквы проявляются под кромкой.</span>
                </span>
              }
            >
              <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted">
                <Icon name="sparkles" size={14} className="text-accent" />
                Наведи ({align})
              </span>
            </Tooltip>
          ))}
          <Tooltip placement="top" content="Раскрытие сверху — для кнопок у нижнего края (плеер).">
            <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted">
              <Icon name="play" size={14} className="text-accent" />
              placement=top
            </span>
          </Tooltip>
          <Tooltip
            placement="right"
            content="Раскрытие сбоку — для вертикальных меню (свёрнутый сайдбар)."
          >
            <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted">
              <Icon name="forward" size={14} className="text-accent" />
              placement=right
            </span>
          </Tooltip>
          <IconButton name="bell" label="Тултип на IconButton" />
        </div>
      </Section>

      <Section title="CornerFrame (standalone)">
        <div className="flex flex-wrap gap-6">
          {(['default', 'accent', 'muted'] as const).map((tone) => (
            <CornerFrame
              key={tone}
              tone={tone}
              className="grid h-20 w-40 place-items-center bg-surface"
            >
              <span className="label-mono text-muted">{tone}</span>
            </CornerFrame>
          ))}
          <CornerFrame active className="grid h-20 w-40 place-items-center bg-surface">
            <span className="label-mono text-muted">active</span>
          </CornerFrame>
          <CornerFrame
            fill
            className="grid h-20 w-40 cursor-pointer place-items-center bg-surface hatch"
          >
            <span className="relative z-[1] label-mono text-text">hover fill</span>
          </CornerFrame>
        </div>
      </Section>

      <Section title="IconButton (round family)">
        <div className="flex flex-wrap items-center gap-4">
          <IconButton name="play" label="Play" size="sm" />
          <IconButton name="play" label="Play" />
          <IconButton name="play" label="Play" size="lg" />
          <IconButton name="bell" label="Notifications" variant="ghost" />
          <IconButton name="volume-2" label="Mute" active />
          <IconButton name="save" label="Save" disabled />
        </div>
      </Section>

      <Section title="Icons (lucide + brand)">
        <div className="grid grid-cols-6 gap-4 sm:grid-cols-10">
          {ICONS.map((n) => (
            <div key={n} className="flex flex-col items-center gap-1.5" title={n}>
              <Icon name={n} size={22} className="text-text" />
              <span className="truncate text-[9px] text-faint">{n}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <h3 className="mb-1">Plain</h3>
            <p className="text-sm text-muted">border + shadow-2 + surface.</p>
          </Card>
          <Card accent>
            <h3 className="mb-1">Accent edge</h3>
            <p className="text-sm text-muted">Верхняя акцентная кромка.</p>
          </Card>
          <Card corners>
            <h3 className="mb-1">Corners</h3>
            <p className="text-sm text-muted">Декоративные уголки.</p>
          </Card>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="flex max-w-md flex-col gap-3">
          <Input placeholder="Text input…" />
          <Input placeholder="Disabled" disabled />
          <div>
            <Input aria-invalid defaultValue="bad@" />
            <p className="mt-1 label-mono text-danger">Invalid email</p>
          </div>
          <Textarea rows={3} placeholder="Textarea…" />
        </div>
      </Section>

      <Section title="Feedback & misc (Phase 1)">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Alert tone="ok">
              <Icon name="check" size={16} />
              Saved successfully
            </Alert>
            <Alert tone="warn">
              <Icon name="square-alert" size={16} />
              Heads up — check your settings
            </Alert>
            <Alert tone="danger">
              <Icon name="close" size={16} />
              Something went wrong
            </Alert>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Badge>
              <Icon name="sparkles" size={12} />
              Pioneer
            </Badge>
            <Chip icon="clock" text="video up to 30s" />
            <Chip icon="image" text="up to 25 MB" />
            <Avatar url={null} name="Kravets" />
            <Avatar url={null} name="Ihor" size={36} />
          </div>
          <div className="flex max-w-md flex-col gap-3">
            <ProgressBar value={0.62} />
            <ProgressBar value={null} />
          </div>
          <div className="grid h-72 place-items-center overflow-hidden border border-border bg-bg">
            <Loader label="Loading" />
          </div>
        </div>
      </Section>

      <Section title="Glass & hatch">
        <div className="relative overflow-hidden rounded-none border border-border">
          <div className="hatch-strong absolute inset-0 bg-surface" />
          <div className="relative flex flex-wrap items-center gap-4 p-8">
            <Surface className="rounded-none px-5 py-4">
              <span className="label-mono text-text">glass panel</span>
            </Surface>
            <Surface variant="glass-badge" className="rounded-full px-4 py-1.5">
              <span className="label-mono text-text">glass badge</span>
            </Surface>
            <div className="hatch h-16 w-24 border border-border" title="hatch 10%" />
            <div className="hatch-strong h-16 w-24 border border-border" title="hatch-strong 20%" />
            <div className="hatch-accent h-16 w-24 border border-border" title="hatch-accent" />
          </div>
        </div>
      </Section>
    </div>
  );
}
