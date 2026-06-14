/**
 * Звуковое уведомление для дашборда модерации (через Web Audio, без файла).
 * Браузеры блокируют автоплей до первого жеста — поэтому разблокируем контекст
 * по первому клику/нажатию клавиши на странице.
 */
let ctx: AudioContext | null = null;
let unlockBound = false;

function ensureCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** Один раз навесить разблокировку аудио на первый жест пользователя. */
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

/** Короткий восходящий сигнал, привлекающий внимание. */
export function playNotify(): void {
  const c = ensureCtx();
  if (!c) return;
  void c.resume();
  const gain = c.createGain();
  gain.gain.value = 0.16;
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
