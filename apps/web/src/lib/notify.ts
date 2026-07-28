/**
 * Audio notifications via Web Audio (no file). Browsers block autoplay until first user gesture,
 * so unlock context on initial pointer/key event.
 */
let ctx: AudioContext | null = null;
let unlockBound = false;

/** Loudness of the chime at full volume — what it always was before the setting existed. */
const PEAK_GAIN = 0.16;
/** 0..1, the streamer's preference. Module-level on purpose: every caller (the hub, the dashboard's
 *  own socket) wants the same one, and none of them should have to carry it. */
let volume = 1;

/**
 * Set the notification volume, 0..1. Squared on the way to the gain node because loudness is not
 * heard linearly: without the curve the whole usable range of "quieter, but still there" is
 * squeezed into the bottom fifth of the slider, which is exactly where it needs resolution.
 */
export function setNotifyVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v)) ** 2;
}

function ensureCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

export function initAudioUnlock(): void {
  if (unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    void ensureCtx()?.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function playNotify(): void {
  const c = ensureCtx();
  if (!c) return;
  if (volume === 0) return; // silent is silent: don't wake the audio context for nothing
  void c.resume();
  const gain = c.createGain();
  gain.gain.value = PEAK_GAIN * volume;
  gain.connect(c.destination);
  const tones: [number, number][] = [
    [880, 0],
    [1175, 0.13],
    [1568, 0.26],
  ];
  for (const [freq, at] of tones) {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(gain);
    const start = c.currentTime + at;
    osc.start(start);
    osc.stop(start + 0.14);
  }
}
