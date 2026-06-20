interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  grav: number;
  shape: 'dot' | 'shard';
  r: number;
  w: number;
  h: number;
  color: string;
  life: number;
  ttl: number;
}

// Brand accent from theme tokens (fallback: #8df0cc); dark reds are hardcoded shard tints.
let MINT = '#8df0cc';
const REDS = ['#fb5b6e', '#c23a4a', '#7e2533'];
let colorsResolved = false;

function resolveColors() {
  if (colorsResolved || typeof window === 'undefined') return;
  colorsResolved = true;
  const cs = getComputedStyle(document.documentElement);
  MINT = cs.getPropertyValue('--color-accent').trim() || MINT;
  const danger = cs.getPropertyValue('--color-danger').trim();
  if (danger) REDS[0] = danger;
}

const parts: P[] = [];
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1;
let raf = 0;
let lastT = 0;

function size() {
  if (!canvas || !ctx) return;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ensure() {
  if (canvas) return;
  resolveColors();
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:45';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  dpr = Math.min(2, window.devicePixelRatio || 1);
  size();
  window.addEventListener('resize', size);
}

function loop(now: number) {
  if (!ctx) {
    raf = 0;
    return;
  }
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
  lastT = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;
    p.life -= dt / p.ttl;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, p.life);
    if (p.shape === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * Math.max(0.3, p.life), 0, 6.2832);
      ctx.fillStyle = p.color;
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  if (parts.length) {
    raf = requestAnimationFrame(loop);
  } else {
    raf = 0;
    lastT = 0;
  }
}

/**
 * Burst particle effect from card rect. approve: mint sparks upward; reject: red shards outward+down.
 * dir: X-spread bias (swipe direction). Uses lazy fixed canvas (z-45, pointer-events:none).
 */
export function disintegrate(rect: DOMRect, kind: 'approve' | 'reject', dir = 0) {
  if (typeof window === 'undefined') return;
  ensure();
  const area = rect.width * rect.height;
  if (kind === 'approve') {
    const n = Math.min(60, Math.round(area / 1200));
    for (let i = 0; i < n; i++) {
      parts.push({
        x: rect.left + Math.random() * rect.width,
        y: rect.top + Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 50,
        vy: -40 - Math.random() * 150,
        grav: 34,
        rot: 0,
        vrot: 0,
        shape: 'dot',
        r: 1.1 + Math.random() * 2.1,
        w: 0,
        h: 0,
        color: MINT,
        life: 1,
        ttl: 0.6 + Math.random() * 0.45,
      });
    }
  } else {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const n = Math.min(40, Math.round(area / 1400));
    for (let i = 0; i < n; i++) {
      const x = rect.left + Math.random() * rect.width;
      const y = rect.top + Math.random() * rect.height;
      const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.6;
      const sp = 90 + Math.random() * 220;
      parts.push({
        x,
        y,
        vx: Math.cos(ang) * sp + dir * 130,
        vy: Math.sin(ang) * sp - 50,
        grav: 520,
        rot: Math.random() * 6.28,
        vrot: (Math.random() - 0.5) * 16,
        shape: 'shard',
        r: 0,
        w: 5 + Math.random() * 13,
        h: 3 + Math.random() * 6,
        color: REDS[i % REDS.length]!,
        life: 1,
        ttl: 0.5 + Math.random() * 0.4,
      });
    }
  }
  if (parts.length > 600) parts.splice(0, parts.length - 600);
  if (!raf) {
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }
}
