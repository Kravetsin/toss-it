import { useEffect, useRef, useState } from 'react';
import type { LiveStatus, UploadResponse } from '@tmw/shared';
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
  Surface,
  Textarea,
  Tooltip,
} from '@/ui';
import type { IconName } from '@/ui/icons';
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
