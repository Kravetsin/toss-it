/**
 * Rules for a bought display name — the one cosmetic that is text rather than light.
 *
 * Any script is allowed on purpose: a viewer whose Twitch handle had to become `dragon_xX21` to be
 * globally unique is exactly who this is for, and so is someone writing 长尺丹丷乇丁丂. What is
 * constrained is not the alphabet but the three ways free text hurts a surface it did not design:
 *
 *  - SIZE is counted in what the eye sees, not in code points. An emoji is many code points and one
 *    glyph; a CJK ideograph is one code point and two columns wide. So the limits are on grapheme
 *    clusters AND on visual width, and both have to hold.
 *  - INVISIBLE characters are removed rather than counted: zero-width spaces pad a name past any
 *    length rule, and bidi overrides can reverse how a line renders around it. Zero-width JOINER is
 *    the deliberate exception — it is what holds 👨‍👩‍👧 together as one glyph.
 *  - STACKED combining marks ("zalgo") are what actually breaks a chat overlay: they grow upward out
 *    of the line box and there is no horizontal limit that catches them. At most two per base.
 *
 * Impersonation is handled separately, by the server: a custom name may not fold to the real name or
 * login of an existing account (see foldForCollision). Custom names do NOT have to be unique among
 * themselves — two people may both be Дракон, because neither is claiming to be a specific someone.
 * That is the whole difference from Twitch's global-uniqueness rule, which is what forces the
 * underscores and digits this item exists to undo.
 */

/**
 * Price of one change, charged every time. Flat rather than escalating: a rising price reads as a
 * penalty for changing your mind, and the sink works better as something people come back to.
 */
export const NAME_CHANGE_DUST = 1000;

/** Longest name in glyphs, and in columns — a name has to pass both. */
export const NAME_MAX_GRAPHEMES = 20;
export const NAME_MAX_WIDTH = 28;
export const NAME_MIN_GRAPHEMES = 2;
/** Consecutive combining marks allowed on one base character. */
const MAX_MARKS = 2;

export type NameProblem = 'empty' | 'tooShort' | 'tooLong' | 'tooWide' | 'badChars' | 'taken';

export interface NameCheck {
  ok: boolean;
  /** The cleaned name to store — present whenever the input had anything usable in it. */
  value: string;
  problem?: NameProblem;
}

/**
 * Code points drawn two columns wide (Unicode East Asian Wide + Fullwidth, plus emoji, which every
 * renderer treats as square). Ranges rather than a table: this is a size heuristic for a length
 * rule, not typesetting.
 */
const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

function isWide(cp: number): boolean {
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp >= lo && cp <= hi) return true;
    if (cp < lo) break;
  }
  return false;
}

/** Split into user-perceived characters; Intl.Segmenter is the only thing that gets emoji right. */
export function graphemes(s: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return [...seg.segment(s)].map((g) => g.segment);
  }
  return [...s];
}

/** Columns the name occupies: wide glyphs count two, combining marks nothing. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const g of graphemes(s)) {
    const cp = g.codePointAt(0);
    if (cp === undefined) continue;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}

/**
 * Remove what must never be stored, and normalise spacing. Not a rejection step: a name that only
 * needed cleaning should succeed, so the person is not made to hunt for an invisible character they
 * cannot see by definition.
 */
export function sanitizeDisplayName(raw: string): string {
  const out: string[] = [];
  let marks = 0;
  // Zero-width JOINER survives (it welds emoji sequences); every other format control does not.
  for (const ch of raw.normalize('NFC')) {
    if (ch === '‍') {
      out.push(ch);
      continue;
    }
    if (/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u.test(ch)) continue;
    if (/\p{Zs}/u.test(ch)) {
      // Any exotic space becomes a plain one; runs collapse below.
      out.push(' ');
      marks = 0;
      continue;
    }
    if (/\p{M}/u.test(ch)) {
      if (marks >= MAX_MARKS) continue;
      marks += 1;
      out.push(ch);
      continue;
    }
    marks = 0;
    out.push(ch);
  }
  return out.join('').replace(/ {2,}/g, ' ').trim();
}

/** Latin look-alikes for the alphabets that share our users' keyboards. */
const CONFUSABLES: Record<string, string> = {
  а: 'a',
  в: 'b',
  с: 'c',
  е: 'e',
  н: 'h',
  к: 'k',
  м: 'm',
  о: 'o',
  р: 'p',
  т: 't',
  х: 'x',
  у: 'y',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ɡ: 'g',
  ⅼ: 'l',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  ν: 'v',
};

/**
 * The key two names are compared by when asking "is this someone else's identity". Deliberately
 * aggressive — it folds case, separators, accents and Cyrillic/Greek look-alikes — because the
 * attack is `Krаvets` with one Cyrillic а, not a name that differs honestly.
 */
/**
 * The key a name is MATCHED by while somebody is looking for it: case and accents folded, nothing
 * else. Deliberately gentler than foldForCollision — that one answers "is this a claim on someone
 * else's identity" and folds Cyrillic look-alikes onto Latin, which in a search would quietly merge
 * two people who genuinely have different names.
 *
 * It exists because SQL cannot do this: SQLite's lower() folds ASCII and nothing else, so every
 * Cyrillic name comes back from it untouched.
 */
export function foldForSearch(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function foldForCollision(name: string): string {
  const flat = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '';
  for (const ch of flat) {
    if (/[\s_.-]/u.test(ch)) continue;
    out += CONFUSABLES[ch] ?? ch;
  }
  return out;
}

/** Clean the input, then hold it to the size rules. `taken` is the server's to add. */
export function checkDisplayName(raw: string): NameCheck {
  const value = sanitizeDisplayName(typeof raw === 'string' ? raw : '');
  if (!value) return { ok: false, value, problem: raw.trim() ? 'badChars' : 'empty' };
  const count = graphemes(value).length;
  if (count < NAME_MIN_GRAPHEMES) return { ok: false, value, problem: 'tooShort' };
  if (count > NAME_MAX_GRAPHEMES) return { ok: false, value, problem: 'tooLong' };
  if (displayWidth(value) > NAME_MAX_WIDTH) return { ok: false, value, problem: 'tooWide' };
  return { ok: true, value };
}
