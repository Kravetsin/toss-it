import { useState } from 'react';
import {
  COSMETICS,
  LEVEL_GLOW_FROM,
  LEVEL_TIERS,
  cosmeticModule,
  levelTier,
  toRoman,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Card, Select } from '@/ui';
import { PlatformIcon, SealMark, UserBadges } from '@/components/UserMarks';

/**
 * DRAFT bench for the global (account-wide) rank mark — five silhouette stages of ONE object, to be
 * looked at next to a real equipped seal before any of it is committed. Deliberately NOT in the
 * cosmetics registry: registering it would put it in the shop and in the seal slot, and the whole
 * point of the design is that rank lives in its own slot and is never chosen. Delete this file (and
 * its Section in GalleryPage) once the shape is picked and a real module is written.
 *
 * The rules being tested here, from the design discussion:
 * - ONE figure that gains structure, so growth reads as silhouette, not as a count of particles.
 * - Monochrome: the tier color and nothing else, so it cannot compete with a seal's own palette.
 * - Motion only at the top stages — a rank next to an animated seal must be the quiet one.
 */

const CX = 12;
const CY = 12;

/** Pointy-top hexagon of radius r, as polygon points. */
function hex(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((90 + i * 60) * Math.PI) / 180;
    return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY - r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** Four diagonal rays, drawn outside the crystal between two radii. */
function rays(from: number, to: number) {
  return [45, 135, 225, 315].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return (
      <line
        key={deg}
        x1={(CX + from * Math.cos(a)).toFixed(2)}
        y1={(CY - from * Math.sin(a)).toFixed(2)}
        x2={(CX + to * Math.cos(a)).toFixed(2)}
        y2={(CY - to * Math.sin(a)).toFixed(2)}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    );
  });
}

const shell = (r: number) => (
  <polygon points={hex(r)} fill="none" stroke="currentColor" strokeWidth="1.5" />
);
const facet = <polygon points={hex(2.9)} fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />;
const core = <circle cx={CX} cy={CY} r="1.5" fill="currentColor" />;
const ring = (spin: boolean) => (
  <g className={spin ? 'rank-spin' : ''}>
    <circle
      cx={CX}
      cy={CY}
      r="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      opacity="0.6"
      strokeDasharray="3 4"
    />
    {spin && <circle cx={CX} cy="2" r="1.1" fill="currentColor" />}
  </g>
);

export interface RankStage {
  name: string;
  /** Lowest global level that shows this stage. */
  from: number;
  render: () => React.ReactNode;
  /** Top stage only: a slow glow breath. */
  breathe?: boolean;
}

/** Five stages over ten levels — the exact level is carried by the TIER COLOR, not by the shape,
 *  which is what keeps neighbouring stages from having to be told apart. */
export const RANK_STAGES: RankStage[] = [
  { name: 'Shard', from: 1, render: () => shell(4.6) },
  {
    name: 'Facet',
    from: 3,
    render: () => (
      <>
        {shell(5.8)}
        {facet}
      </>
    ),
  },
  {
    name: 'Charge',
    from: 5,
    render: () => (
      <>
        {shell(5.8)}
        {facet}
        {core}
        {rays(7.2, 9.4)}
      </>
    ),
  },
  {
    name: 'Crown',
    from: 7,
    render: () => (
      <>
        {ring(false)}
        {shell(5.8)}
        {facet}
        {core}
        {rays(7.2, 9.4)}
      </>
    ),
  },
  {
    name: 'Eternal',
    from: 9,
    breathe: true,
    render: () => (
      <>
        {ring(true)}
        {shell(5.8)}
        {facet}
        {core}
        {rays(7.2, 9.4)}
      </>
    ),
  },
];

export function rankStageIndex(level: number): number {
  let idx = 0;
  RANK_STAGES.forEach((s, i) => {
    if (level >= s.from) idx = i;
  });
  return idx;
}

/** Draft styles, scoped to this bench (a real module would ship them via the cosmetics registry). */
function RankDraftStyles() {
  return (
    <style>{`
@keyframes rank-spin { to { transform: rotate(360deg); } }
@keyframes rank-breathe {
  0%, 100% { filter: drop-shadow(0 0 0.04em currentColor); }
  50% { filter: drop-shadow(0 0 0.16em currentColor); }
}
.rank-spin { transform-box: view-box; transform-origin: ${CX}px ${CY}px; animation: rank-spin 16s linear infinite; }
.rank-breathe { animation: rank-breathe 3.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .rank-spin, .rank-breathe { animation: none; } }
`}</style>
  );
}

/**
 * The rank mark itself. `color` overrides the tier color — used only by the silhouette row, where
 * the point is to compare shapes with the color noise taken away.
 */
export function RankMark({
  level,
  size = 24,
  color,
}: {
  level: number;
  size?: number;
  color?: string;
}) {
  const tier = levelTier(level);
  if (!tier) return null;
  const stage = RANK_STAGES[rankStageIndex(level)]!;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0"
      style={{ color: color ?? tier.color, lineHeight: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={`${stage.breathe && !color ? 'rank-breathe' : ''} ${tier.iris && !color ? 'lvl-iris' : ''}`}
      >
        {stage.render()}
      </svg>
    </span>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="label-mono text-muted">{label}</span>
        <span className="text-sm text-faint">{hint}</span>
      </div>
      {children}
    </div>
  );
}

/** The channel-level rail + Roman numeral, as the leaderboard row draws them today. */
function ChannelRank({ level }: { level: number }) {
  const tier = levelTier(level);
  if (!tier) return null;
  const glow = level >= LEVEL_GLOW_FROM;
  return (
    <span
      className={`shrink-0 text-xs font-bold ${tier.iris ? 'lvl-iris' : ''}`}
      style={{ color: tier.color, textShadow: glow ? `0 0 6px ${tier.color}` : undefined }}
    >
      {toRoman(level)}
    </span>
  );
}

/**
 * A nick line built from the real marks (SealMark, PlatformIcon, UserBadges) in the proposed order:
 * seal — nick — RANK — platform — badges. A mock on purpose: no production component has the rank
 * slot yet, and cutting one in before the shape is chosen is exactly backwards.
 */
function NickLine({
  seal,
  globalLevel,
  channelLevel,
  fontPx,
  markPx,
}: {
  seal: string;
  globalLevel: number;
  channelLevel: number;
  fontPx: number;
  markPx: number;
}) {
  return (
    <span className="flex items-center gap-1.5" style={{ fontSize: fontPx }}>
      <ChannelRank level={channelLevel} />
      <SealMark seal={seal} size={markPx} />
      <b className="truncate font-semibold text-text">thunderstruck</b>
      <RankMark level={globalLevel} size={markPx} />
      <PlatformIcon userId="twitch:bench" size={13} />
      <UserBadges isFounder size={markPx} />
    </span>
  );
}

export function RankDraftBench() {
  const { t } = useI18n();
  const seals = COSMETICS.filter((c) => c.type === 'seal' && !c.upgrade);
  const [sealId, setSealId] = useState('seal-core');
  const [globalLevel, setGlobalLevel] = useState(9);
  const [channelLevel, setChannelLevel] = useState(4);

  const levels = Array.from({ length: 10 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} · ${LEVEL_TIERS[i]!.name}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <RankDraftStyles />

      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={sealId}
          onChange={setSealId}
          options={seals.map((s) => ({
            value: s.id,
            label: t(cosmeticModule(s.id)?.labels.name ?? s.id),
          }))}
          label="Equipped seal (left of the nick)"
        />
        <Select
          value={String(globalLevel)}
          onChange={(v) => setGlobalLevel(Number(v))}
          options={levels}
          label="Global rank (the new mark)"
        />
        <Select
          value={String(channelLevel)}
          onChange={(v) => setChannelLevel(Number(v))}
          options={[{ value: '0', label: '0 · none' }].concat(levels)}
          label="Channel level (rail + numeral)"
        />
      </div>

      <Row
        label="Stages"
        hint="one object gaining structure · chat 15px / web 24px / banner 28px — the 15px column is the verdict"
      >
        <div className="flex flex-wrap gap-6">
          {RANK_STAGES.map((s, i) => (
            <div key={s.name} className="flex flex-col items-center gap-2">
              <div className="flex items-end gap-3">
                {[15, 24, 28].map((px) => (
                  <RankMark key={px} level={s.from} size={px} />
                ))}
              </div>
              <span className="label-mono text-faint">
                {i + 1}. {s.name}
              </span>
              <span className="text-xs text-faint">
                lvl {s.from}–{RANK_STAGES[i + 1] ? RANK_STAGES[i + 1]!.from - 1 : 10}
              </span>
            </div>
          ))}
        </div>
      </Row>

      <Row
        label="Silhouettes only"
        hint="same five, color taken away — if two are hard to tell apart here, the color is doing the work"
      >
        <div className="flex flex-wrap items-end gap-6 text-muted">
          {RANK_STAGES.map((s) => (
            <RankMark key={s.name} level={s.from} size={28} color="currentColor" />
          ))}
        </div>
      </Row>

      <Row
        label="All ten levels"
        hint="the exact level is carried by the tier color; the shape only changes every two"
      >
        <div className="flex flex-wrap items-center gap-3">
          {LEVEL_TIERS.map((tier, i) => (
            <div key={tier.name} className="flex flex-col items-center gap-1">
              <RankMark level={i + 1} size={26} />
              <span className="label-mono text-faint">{i + 1}</span>
            </div>
          ))}
        </div>
      </Row>

      <Row
        label="Channel row"
        hint="channel page · 544px · seal left, rank right — the competition test"
      >
        <div style={{ maxWidth: 544 }}>
          <Card>
            <div className="relative">
              {levelTier(channelLevel) && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[3px]"
                  style={{ background: levelTier(channelLevel)!.color }}
                />
              )}
              <div className="flex items-center gap-3 px-2 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-sm font-semibold text-accent-contrast">
                  1
                </span>
                <NickLine
                  seal={sealId}
                  globalLevel={globalLevel}
                  channelLevel={channelLevel}
                  fontPx={14}
                  markPx={24}
                />
              </div>
            </div>
          </Card>
        </div>
      </Row>

      <Row label="Submission card" hint="dashboard queue · 520px · the streamer's reading order">
        <div style={{ maxWidth: 520 }}>
          <div className="border border-border bg-surface-2 p-3 shadow-1">
            <NickLine
              seal={sealId}
              globalLevel={globalLevel}
              channelLevel={channelLevel}
              fontPx={14}
              markPx={24}
            />
            <p className="mt-2 text-sm text-muted">бахнуло знатно, го смотреть</p>
          </div>
        </div>
      </Row>

      <Row
        label="Chat size"
        hint="the smallest surface anything has to survive · 15px marks — mock, the real chat is in apps/overlay"
      >
        <div className="border border-border bg-bg p-3" style={{ maxWidth: 380 }}>
          <NickLine
            seal={sealId}
            globalLevel={globalLevel}
            channelLevel={channelLevel}
            fontPx={13}
            markPx={15}
          />
          <p className="mt-1 text-sm text-text">го смотреть</p>
        </div>
      </Row>
    </div>
  );
}
