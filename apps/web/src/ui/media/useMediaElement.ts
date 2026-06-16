import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Снимок состояния <video>/<audio>, на котором рисуем свои контролы. */
export interface MediaElementState {
  playing: boolean;
  current: number; // сек
  duration: number; // сек (0 / не-конечная ⇒ длительность неизвестна, напр. стрим)
  buffered: number; // сек загружено
  volume: number; // 0..1
  muted: boolean;
  ready: boolean; // метаданные загружены
  waiting: boolean; // буферизация
  ended: boolean;
  error: boolean;
}

export interface MediaElementControls {
  toggle: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  replay: () => void;
  beginScrub: () => void;
  endScrub: () => void;
}

const INITIAL: MediaElementState = {
  playing: false,
  current: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  ready: false,
  waiting: false,
  ended: false,
  error: false,
};

/**
 * Централизует воспроизведение для <video>/<audio>: подписывается на события
 * элемента, плавно тянет currentTime через rAF во время игры и отдаёт действия.
 * URL/он не трогает (его владелец — вызывающий код, напр. object-URL превью).
 */
export function useMediaElement(
  ref: RefObject<HTMLMediaElement | null>,
): MediaElementState & MediaElementControls {
  const [state, setState] = useState<MediaElementState>(INITIAL);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const patch = (p: Partial<MediaElementState>) => setState((s) => ({ ...s, ...p }));
    const dur = () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);

    const onLoaded = () =>
      patch({ duration: dur(), ready: true, volume: el.volume, muted: el.muted });
    const onDuration = () => patch({ duration: dur() });
    const onPlay = () => patch({ playing: true, ended: false });
    const onPause = () => patch({ playing: false });
    const onEnded = () => patch({ playing: false, ended: true });
    const onWaiting = () => patch({ waiting: true });
    const onPlaying = () => patch({ waiting: false, playing: true, ended: false });
    const onTime = () => {
      if (!scrubbingRef.current) patch({ current: el.currentTime });
    };
    const onProgress = () => {
      const b = el.buffered;
      if (b.length) patch({ buffered: b.end(b.length - 1) });
    };
    const onVolume = () => patch({ volume: el.volume, muted: el.muted });
    const onError = () => patch({ error: true, waiting: false });

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('progress', onProgress);
    el.addEventListener('volumechange', onVolume);
    el.addEventListener('error', onError, true);

    // Стартовая синхронизация (метаданные/громкость могли подъехать до подписки).
    patch({ volume: el.volume, muted: el.muted });
    if (el.readyState >= 1) onLoaded();

    return () => {
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('error', onError, true);
    };
  }, [ref]);

  // Плавная заливка прогресса: тянем currentTime каждый кадр, пока играет.
  useEffect(() => {
    if (!state.playing) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const loop = () => {
      if (!scrubbingRef.current) {
        const t = el.currentTime;
        setState((s) => (s.current === t ? s : { ...s, current: t }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.playing, ref]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      // play() — промис: гасим AbortError/NotAllowedError (быстрый тоггл/политика автоплея).
      void el.play().catch(() => setState((s) => ({ ...s, playing: false })));
    } else {
      el.pause();
    }
  }, [ref]);

  const seek = useCallback((sec: number) => {
    const el = ref.current;
    if (!el) return;
    // При неизвестной длительности (стрим/live) не клампим сверху — пусть решает браузер.
    const known = Number.isFinite(el.duration) && el.duration > 0;
    const t = known ? Math.max(0, Math.min(sec, el.duration)) : Math.max(0, sec);
    el.currentTime = t;
    setState((s) => ({ ...s, current: t, ended: false }));
  }, [ref]);

  const setVolume = useCallback((v: number) => {
    const el = ref.current;
    if (!el) return;
    const vol = Math.max(0, Math.min(1, v));
    el.volume = vol;
    if (vol > 0 && el.muted) el.muted = false;
  }, [ref]);

  const toggleMute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
  }, [ref]);

  const replay = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }, [ref]);

  const beginScrub = useCallback(() => {
    scrubbingRef.current = true;
  }, []);
  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
  }, []);

  return { ...state, toggle, seek, setVolume, toggleMute, replay, beginScrub, endScrub };
}

// --- Полноэкранный режим (на корне рамки), с вебкит-фолбэком для Safari. ---

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
  webkitFullscreenEnabled?: boolean;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

function fsElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function useFullscreen(ref: RefObject<HTMLElement | null>): {
  isFullscreen: boolean;
  enabled: boolean;
  toggle: () => void;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [enabled] = useState(
    () =>
      typeof document !== 'undefined' &&
      Boolean(document.fullscreenEnabled || (document as FsDocument).webkitFullscreenEnabled),
  );

  useEffect(() => {
    const onChange = () => {
      const el = fsElement();
      setIsFullscreen(!!el && el === ref.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current as FsElement | null;
    if (!el) return;
    const d = document as FsDocument;
    // requestFullscreen/exitFullscreen — промисы и могут отклониться (отказ юзера,
    // запрет в iframe и т.п.); гасим, чтобы не было unhandled rejection.
    if (fsElement()) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
    } else {
      if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
      else el.webkitRequestFullscreen?.();
    }
  }, [ref]);

  return { isFullscreen, enabled, toggle };
}
