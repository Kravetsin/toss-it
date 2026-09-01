import { FLOOD_CSS, flameMask } from './css';

/**
 * DRAFT concepts for the RARE FLOOD — the moment a card fills with its frame's element. Four
 * readings of one slot: two for Dragon breath (flames / melt) and two for Tide (fill / a single
 * wave), so the axis "does it FILL or does it PASS THROUGH" can be judged on both elements.
 *
 * Not in the cosmetics registry on purpose (see ./css.ts). Delete this folder, ../FloodBench.tsx and
 * its Section in GalleryPage once a survivor moves into packages/shared/src/cosmetics/effects.
 */

/** One generated element inside the flood layer (a tongue, an ember, a bubble). */
export interface FloodPart {
  cls: string;
  style: Record<string, string>;
}

export interface FloodConcept {
  id: string;
  title: string;
  blurb: string;
  /** Catalogue frame worn UNDER the flood, so the pair is judged together and not in isolation. */
  frameClass: string;
  /** Variant class on the flood layer (see ./css.ts). */
  cls: string;
  /** Length of the one-shot, ms. */
  ms: number;
  parts: (compact: boolean) => FloodPart[];
}

/**
 * Deterministic pseudo-random, seeded per concept+size. The bench must look the SAME on every
 * re-render — a layout that reshuffles itself between replays cannot be judged against itself.
 */
function seeded(seed: number): (min: number, max: number) => number {
  let s = seed >>> 0;
  return (min, max) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return min + (s / 4294967296) * (max - min);
  };
}

/** Even spread across the width with a little jitter, from the index alone (cf. ../../spread). */
function spread(i: number, n: number, rnd: (a: number, b: number) => number): string {
  return `${(6 + ((i + 0.5) / n) * 88 + rnd(-3.5, 3.5)).toFixed(1)}%`;
}

const forge: FloodConcept = {
  id: 'forge',
  title: 'Огонь — горн',
  blurb:
    'Кромка вспыхивает, из неё поднимаются языки: у каждого свой наклон и своё дыхание, с кончиков срываются искры. Гаснет сверху вниз — огонь отступает к топливу.',
  frameClass: 'frame-fx-dragon-breath',
  cls: 'f-forge',
  ms: 3600,
  parts: (compact) => {
    const rnd = seeded(compact ? 71 : 17);
    const n = compact ? 5 : 8;
    const embers = compact ? 5 : 11;
    const parts: FloodPart[] = [
      { cls: 'wash', style: {} },
      { cls: 'bed', style: {} },
    ];
    // BACK ROW first (paint order is depth): shorter, offset half a step from the front row so it
    // fills the gaps between the front flames instead of hiding behind them.
    const back = compact ? 4 : 7;
    for (let i = 0; i < back; i++) {
      parts.push({
        cls: 'tongue back',
        style: {
          '--x': `${(2 + (i / back) * 94 + rnd(-2, 2)).toFixed(1)}%`,
          '--w': `${(compact ? rnd(12, 20) : rnd(26, 46)).toFixed(0)}px`,
          '--fm': flameMask(i + 2),
          '--h': `${(compact ? rnd(44, 74) : rnd(30, 62)).toFixed(0)}%`,
          '--lick': `${rnd(0.7, 1.3).toFixed(2)}s`,
          '--dl': `${rnd(0, 0.3).toFixed(2)}s`,
        },
      });
    }
    for (let i = 0; i < n; i++) {
      // Every third one is a low starter between two tall neighbours. Assigned by index, not rolled:
      // a roll gives some cards a row of equal lamps, which is exactly what fire never looks like.
      const small = i % 3 === 1;
      const w = compact ? rnd(13, 22) : small ? rnd(20, 30) : rnd(30, 62);
      parts.push({
        cls: 'tongue',
        style: {
          '--x': spread(i, n, rnd),
          '--w': `${w.toFixed(0)}px`,
          '--fm': flameMask(i),
          // Tall and narrow beats short and wide: a wide tongue at pill height is a blob.
          '--h': `${(compact ? rnd(72, 120) : small ? rnd(26, 44) : rnd(56, 112)).toFixed(0)}%`,
          '--lick': `${rnd(0.62, 1.15).toFixed(2)}s`,
          '--dl': `${rnd(0, 0.22).toFixed(2)}s`,
        },
      });
    }
    for (let i = 0; i < embers; i++) {
      parts.push({
        cls: 'ember',
        style: {
          '--x': spread(i, embers, rnd),
          '--from': `${rnd(6, 34).toFixed(0)}%`,
          '--s': `${rnd(1.6, 3).toFixed(1)}px`,
          '--rise': `${(compact ? rnd(22, 46) : rnd(60, 150)).toFixed(0)}px`,
          '--drift': `${rnd(-16, 16).toFixed(0)}px`,
          '--edur': `${rnd(0.9, 1.8).toFixed(2)}s`,
          '--dl': `${rnd(0, 1).toFixed(2)}s`,
        },
      });
    }
    parts.push({ cls: 'rim', style: {} });
    return parts;
  },
};

const lava: FloodConcept = {
  id: 'lava',
  title: 'Огонь — расплав',
  blurb:
    'Тяжёлый уровень: заливается рывком, перехлёстывает и оседает. Сверху корка с трещинами, которые медленно ползут, снизу всплывают пузыри расплава.',
  frameClass: 'frame-fx-dragon-breath',
  cls: 'f-lava',
  ms: 4200,
  parts: (compact) => {
    const rnd = seeded(compact ? 91 : 33);
    const n = compact ? 3 : 6;
    const parts: FloodPart[] = [{ cls: 'body', style: {} }];
    for (let i = 0; i < n; i++) {
      parts.push({
        cls: 'blorp',
        style: {
          '--x': spread(i, n, rnd),
          '--from': `${rnd(2, 16).toFixed(0)}%`,
          '--s': `${(compact ? rnd(3, 5) : rnd(5, 11)).toFixed(1)}px`,
          '--rise': `${(compact ? rnd(8, 16) : rnd(26, 62)).toFixed(0)}px`,
          '--edur': `${rnd(1.4, 2.4).toFixed(2)}s`,
          '--dl': `${rnd(0, 1.2).toFixed(2)}s`,
        },
      });
    }
    parts.push({ cls: 'crust', style: {} }, { cls: 'rim', style: {} });
    return parts;
  },
};

const tide: FloodConcept = {
  id: 'tide',
  title: 'Вода — прилив',
  blurb:
    'Две волны едут навстречу друг другу с разной скоростью, по гребню — светлая линия. Внутри поднимаются пузырьки, после схода на стекле секунду остаётся блик.',
  frameClass: 'frame-fx-water',
  cls: 'f-tide',
  ms: 4200,
  parts: (compact) => {
    const rnd = seeded(compact ? 53 : 11);
    const n = compact ? 4 : 9;
    const wv = compact ? '14px' : '26px';
    const parts: FloodPart[] = [{ cls: 'body', style: {} }];
    for (let i = 0; i < n; i++) {
      parts.push({
        cls: 'bubble',
        style: {
          '--x': spread(i, n, rnd),
          '--from': `${rnd(2, 12).toFixed(0)}%`,
          '--s': `${(compact ? rnd(2.5, 4.5) : rnd(3, 7)).toFixed(1)}px`,
          '--rise': `${(compact ? rnd(14, 26) : rnd(40, 96)).toFixed(0)}px`,
          '--drift': `${rnd(-9, 9).toFixed(0)}px`,
          '--edur': `${rnd(1.3, 2.3).toFixed(2)}s`,
          '--dl': `${rnd(0, 1.3).toFixed(2)}s`,
        },
      });
    }
    // The three wave tiles ride ON TOP of the body, so they come after it and after the bubbles.
    parts.push(
      { cls: 'wave w-back', style: { '--wv': wv } },
      { cls: 'wave w-front', style: { '--wv': wv } },
      { cls: 'wave w-line', style: { '--wv': wv } },
      { cls: 'gloss', style: {} },
      { cls: 'rim', style: {} },
    );
    return parts;
  },
};

const surge: FloodConcept = {
  id: 'surge',
  title: 'Вода — волна',
  blurb:
    'Ничего не наполняется: одна волна проходит сквозь карточку и уходит, оставив мокрое стекло. Короткая — годится как младшая ступень той же семьи.',
  frameClass: 'frame-fx-water',
  cls: 'f-surge',
  ms: 2400,
  parts: (compact) => {
    const rnd = seeded(compact ? 29 : 7);
    const n = compact ? 4 : 8;
    const parts: FloodPart[] = [{ cls: 'crest', style: {} }];
    for (let i = 0; i < n; i++) {
      parts.push({
        cls: 'foam',
        style: {
          '--x': spread(i, n, rnd),
          '--from': `${rnd(4, 54).toFixed(0)}%`,
          '--s': `${rnd(1.6, 3.4).toFixed(1)}px`,
          '--rise': `${(compact ? rnd(6, 14) : rnd(14, 40)).toFixed(0)}px`,
          '--drift': `${rnd(4, 26).toFixed(0)}px`,
          '--edur': `${rnd(0.7, 1.2).toFixed(2)}s`,
          // Foam only exists once the crest has reached that column.
          '--dl': `${(0.2 + (i / n) * 1.1).toFixed(2)}s`,
        },
      });
    }
    parts.push({ cls: 'gloss', style: {} }, { cls: 'rim', style: {} });
    return parts;
  },
};

export const FLOOD_CONCEPTS: FloodConcept[] = [forge, lava, tide, surge];

/** Inject the bench stylesheet once (mirrors injectCosmeticsStyles, refresh-on-change included). */
export function injectFloodStyles(): void {
  if (typeof document === 'undefined') return;
  const ID = 'flood-bench-styles';
  const existing = document.getElementById(ID);
  if (existing) {
    if (existing.textContent !== FLOOD_CSS) existing.textContent = FLOOD_CSS;
    return;
  }
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = FLOOD_CSS;
  document.head.appendChild(style);
}
