import type { IconName } from '@/ui/icons';

/**
 * Animation funnel math without React/DOM. One token travels tracks between 4 nodes;
 * at moderation: fork (approve/reject/trust). Geometry: viewBox 0 0 680 150.
 */

export const STAGE_ICONS: IconName[] = ['upload', 'loader', 'shield', 'play'];

export const NODE_X = [70, 250, 430, 610];
export const TRACK_Y = 78;
export const NODE_R = 22;
export const MOD = 2; // moderation node index
export const STREAM = 3; // live stream node index

export const HOP = 14; // arc height between nodes
export const TRUST_HOP = 70; // high arc for trust path (bypasses moderation)
export const REJECT_RECOIL = 34; // bounce distance when rejected
export const REJECT_DIP = 12; // dip amplitude during reject bounce
export const RETURN_HOP = 58; // return arc height to start

export const FWD_DUR = 6200; // forward pass duration (upload → verdict)
export const END_PAUSE = 1100; // pause at verdict before return
export const RETURN_DUR = 900; // return to start
export const START_PAUSE = 450; // pause before next pass

// Verdict is constant per pass; ORDER ensures first show is APPROVE, then cycles.
export const APPROVE = 0;
export const REJECT = 1;
export const TRUST = 2;
export const ORDER = [APPROVE, TRUST, APPROVE, REJECT];

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Trapezoid 0→1→0: fade-in [a,b], hold [b,c], fade-out [c,d]. For stamp opacity. */
export const pulse = (x: number, a: number, b: number, c: number, d: number) =>
  x < a ? 0 : x < b ? (x - a) / (b - a) : x < c ? 1 : x < d ? 1 - (x - c) / (d - c) : 0;

/** Frame state: token position, node highlights, segment fills, stamp opacities. */
export interface Frame {
  x: number;
  y: number;
  op: number; // token opacity (fades on reject)
  sc: number; // token scale (grows on trust)
  lit: [boolean, boolean, boolean, boolean]; // node highlights
  seg: [number, number, number]; // edge fill progress 0..1
  live: number; // expanding ring on stream reach 0..1
  stampApprove: number;
  stampReject: number;
  stampTrust: number;
}

const X = NODE_X;

/** Frame state for forward pass (p∈[0,1]) and verdict choice. */
export function frameState(p: number, verdict: number): Frame {
  let x: number;
  let y = TRACK_Y;
  let op = 1;
  let sc = 1;
  let lit: Frame['lit'] = [true, false, false, false];
  let live = 0;

  if (verdict === TRUST) {
    if (p < 0.22) {
      const t = p / 0.22;
      x = lerp(X[0]!, X[1]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
    } else if (p < 0.3) {
      x = X[1]!;
      lit = [true, true, false, false];
    } else if (p < 0.82) {
      // Trust path bypasses moderation (node 1 → node 3 in one arc).
      const t = (p - 0.3) / 0.52;
      x = lerp(X[1]!, X[3]!, smooth(t));
      y = TRACK_Y - TRUST_HOP * Math.sin(Math.PI * t);
      sc = 1 + 0.12 * Math.sin(Math.PI * t);
      lit = [true, true, x >= X[2]!, false];
    } else {
      const t = (p - 0.82) / 0.18;
      x = X[3]!;
      lit = [true, true, true, true];
      live = clamp01(t / 0.5);
    }
  } else if (verdict === REJECT) {
    if (p < 0.22) {
      const t = p / 0.22;
      x = lerp(X[0]!, X[1]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
    } else if (p < 0.3) {
      x = X[1]!;
      lit = [true, true, false, false];
    } else if (p < 0.52) {
      const t = (p - 0.3) / 0.22;
      x = lerp(X[1]!, X[2]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
      lit = [true, true, false, false];
    } else if (p < 0.64) {
      // Hit shield and bounce left.
      const t = (p - 0.52) / 0.12;
      x = X[2]! - REJECT_RECOIL * smooth(t);
      y = TRACK_Y - REJECT_DIP * Math.sin(Math.PI * t);
      lit = [true, true, true, false];
    } else {
      // Disperses; does not reach stream.
      const t = (p - 0.64) / 0.36;
      x = X[2]! - REJECT_RECOIL;
      op = clamp01(1 - t / 0.5);
      lit = [true, true, true, false];
    }
  } else {
    // APPROVE: pass through all nodes with moderation pause.
    if (p < 0.22) {
      const t = p / 0.22;
      x = lerp(X[0]!, X[1]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
    } else if (p < 0.3) {
      x = X[1]!;
      lit = [true, true, false, false];
    } else if (p < 0.5) {
      const t = (p - 0.3) / 0.2;
      x = lerp(X[1]!, X[2]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
      lit = [true, true, false, false];
    } else if (p < 0.64) {
      x = X[2]!;
      lit = [true, true, true, false];
    } else if (p < 0.86) {
      const t = (p - 0.64) / 0.22;
      x = lerp(X[2]!, X[3]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
      lit = [true, true, true, false];
    } else {
      const t = (p - 0.86) / 0.14;
      x = X[3]!;
      lit = [true, true, true, true];
      live = clamp01(t / 0.5);
    }
  }

  // Edge fill based on token x; on reject, don't reverse or light final edge.
  const seg: Frame['seg'] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    seg[k] = clamp01((x - X[k]!) / (X[k + 1]! - X[k]!));
  }
  if (verdict === REJECT) {
    if (p >= 0.52) seg[1] = 1;
    seg[2] = 0;
  }

  return {
    x,
    y,
    op,
    sc,
    lit,
    seg,
    live,
    stampApprove: verdict === APPROVE ? pulse(p, 0.52, 0.58, 0.74, 0.84) : 0,
    stampReject: verdict === REJECT ? pulse(p, 0.54, 0.62, 0.86, 0.98) : 0,
    stampTrust: verdict === TRUST ? pulse(p, 0.4, 0.5, 0.66, 0.78) : 0,
  };
}

/** Return frame: token arcs from endpoint back to start; edges drain. */
export function frameReturn(rp: number, verdict: number): Frame {
  const e = smooth(rp);
  const endX = verdict === REJECT ? X[2]! - REJECT_RECOIL : X[3]!;
  const drain = 1 - e;
  return {
    x: lerp(endX, X[0]!, e),
    y: TRACK_Y - RETURN_HOP * Math.sin(Math.PI * rp),
    // Rejected token was dispersed; fade-in as it nears home.
    op: verdict === REJECT ? smooth(clamp01((rp - 0.35) / 0.65)) : 1,
    sc: 1,
    lit: [true, false, false, false],
    seg: [drain, drain, verdict === REJECT ? 0 : drain],
    live: 0,
    stampApprove: 0,
    stampReject: 0,
    stampTrust: 0,
  };
}
