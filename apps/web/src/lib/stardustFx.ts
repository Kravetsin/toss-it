/**
 * Imperative bridge for stardust animation: wallet registers its position and balance callback;
 * flyStardust spawns DOM fragment at send point, animates to wallet, then bumps balance on arrival.
 */
interface WalletTarget {
  rect: () => DOMRect | null;
  bump: (to: number) => void;
}
let target: WalletTarget | null = null;

export function registerStardustWallet(t: WalletTarget | null): void {
  target = t;
}

const SPARK =
  'M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z';

/** Animate stardust fragment from `from` (client coords) to wallet; updates balance on arrival. */
export function flyStardust(from: { x: number; y: number }, newBalance: number): void {
  if (!target) return;
  const rect = target.rect();
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!rect || reduced) {
    target.bump(newBalance);
    return;
  }
  const tx = rect.left + rect.width / 2 - 11;
  const ty = rect.top + rect.height / 2 - 11;
  const fx = from.x - 11;
  const fy = from.y - 11;

  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:0;top:0;z-index:60;pointer-events:none;color:var(--color-accent);will-change:transform,opacity';
  el.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="${SPARK}"/></svg>`;
  document.body.appendChild(el);

  const anim = el.animate(
    [
      { transform: `translate(${fx}px, ${fy}px) scale(0.4) rotate(0deg)`, opacity: 0 },
      {
        transform: `translate(${fx}px, ${fy - 28}px) scale(1) rotate(120deg)`,
        opacity: 1,
        offset: 0.25,
      },
      { transform: `translate(${tx}px, ${ty}px) scale(0.5) rotate(360deg)`, opacity: 0.9 },
    ],
    { duration: 850, easing: 'cubic-bezier(.5,0,.4,1)' },
  );
  anim.onfinish = () => {
    el.remove();
    target?.bump(newBalance);
  };
  anim.oncancel = () => el.remove();
}
