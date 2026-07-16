// Imported directly (not looked up by id through the registry, whose union has no common
// className): nick.ts already models the colour family, and this keeps the class name in its module.
import { nickFlow } from './effects/nick-flow';
import { nickEffectModule } from './registry';

/** Gradient direction. Fixed, not a user knob — see the nick-gradient module for why. */
const NICK_GRADIENT_ANGLE = '90deg';

/** The nick cosmetics a surface has resolved for one user (all optional / null when unset). */
export interface NickCosmetics {
  color?: string | null;
  /** Second gradient stop; only meaningful together with `color`. */
  color2?: string | null;
  /** Animate the gradient (nick-flow); needs both stops to drift between. */
  flow?: boolean | null;
  effect?: string | null;
}

/**
 * Class + style for rendering a nickname with its equipped nick cosmetics. Render-independent: the
 * style is a plain prop map (camelCase CSS props + `--custom` properties), so React spreads it as a
 * style object and the overlays apply it with the same `applyStyleMap` walk used for particles — and
 * a future Twitch-chat extension can too. Keep ALL nick rendering going through here.
 *
 * Painting model: a name drawn through a background (any gradient) gets its stops in `--nick-c1` /
 * `--nick-c2`, the ready ramp in `--nick-base`, and `.nick-paint` does the text clipping. Upgrades
 * that animate the name build their own ramp from the stops and override `background-image` from
 * their module CSS — which is why nothing sets the background inline here: an inline declaration
 * would beat their rule.
 */
export function nickRender(n: NickCosmetics): { className: string; style: Record<string, string> } {
  const fx = n.effect ? nickEffectModule(n.effect) : undefined;
  const fxClass = fx?.className ?? '';
  const style: Record<string, string> = {};
  const gradient = !!(n.color && n.color2);
  // Flow needs two stops to drift between; without them there is nothing to animate.
  const flowing = gradient && !!n.flow;

  if (gradient) {
    style['--nick-c1'] = n.color!;
    style['--nick-c2'] = n.color2!;
    style['--nick-base'] =
      `linear-gradient(${NICK_GRADIENT_ANGLE}, var(--nick-c1), var(--nick-c2))`;
  } else if (n.color) {
    style.color = n.color;
  }

  if (fxClass) {
    // Effects glow via drop-shadow on these vars. A painted name is `color: transparent`, so the css
    // `currentColor` fallback would glow transparent — always pass the stops explicitly. Inner halo
    // takes stop 1, outer takes stop 2, so the glow echoes the ramp instead of fighting it.
    const mint = 'var(--cos-mint, #8df0cc)';
    style['--nick-glow'] = n.color || mint;
    style['--nick-glow-2'] = n.color2 || n.color || mint;
  }

  // Compose the animations: they share one element, so a module's own `animation` rule would kill
  // whichever came before it in the stylesheet. Each declares its shorthand; we join them here.
  const anims = [flowing ? nickFlow.animation : '', fx?.animation].filter(Boolean);
  if (anims.length) style.animation = anims.join(', ');

  const flowClass = flowing ? (nickFlow.className ?? '') : '';
  const className = [gradient ? 'nick-paint' : '', flowClass, fxClass].filter(Boolean).join(' ');
  return { className, style };
}
