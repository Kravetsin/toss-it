import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Снимок состояния <video>/<audio>, на котором рисуем свои контролы. */
export interface MediaElementState {
  playing: boolean;
  current: number; // сек
  duration: number; // сек (0 / не-конечная ⇒ длительность неизвестна, напр. стрим)
  buffered: number; // сек загружено
  volume: number; // 0..1
  muted: boolean;
  rate: number; // скорость воспроизведения (1 = норма)
  pip: boolean; // активен ли «картинка-в-картинке»
  ready: boolean; // метаданные загружены
  waiting: boolean; // буферизация
  ended: boolean;
  error: boolean;
  scrubbing: boolean; // пользователь тянет полосу перемотки
}

export interface MediaElementControls {
  toggle: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setRate: (r: number) => void;
  togglePip: () => void;
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
  rate: 1,
  pip: false,
  ready: false,
  waiting: false,
  ended: false,
  error: false,
  scrubbing: false,
};

/**
 * Централизует воспроизведение для <video>/<audio>: подписывается на события элемента,
 * плавно тянет currentTime через rAF во время игры и отдаёт действия. Привязка к элементу —
 * через callback-ref `attach` (а не RefObject): подписка пере-инициализируется ровно тогда,
 * когда элемент реально попадает в DOM — важно для медиа, монтируемого порталом с задержкой
 * (лайтбокс). `el` — RefObject для императивного доступа (load(), play() и т.п.).
 */
export function useMediaElement(): MediaElementState &
  MediaElementControls & {
    pipSupported: boolean;
    attach: (node: HTMLMediaElement | null) => void;
    el: RefObject<HTMLMediaElement | null>;
  } {
  const [state, setState] = useState<MediaElementState>(INITIAL);
  const scrubbingRef = useRef(false);
  const el = useRef<HTMLMediaElement | null>(null);
  const [node, setNode] = useState<HTMLMediaElement | null>(null);
  const attach = useCallback((n: HTMLMediaElement | null) => {
    el.current = n;
    setNode(n);
  }, []);
  const [pipSupported] = useState(
    () => typeof document !== 'undefined' && !!document.pictureInPictureEnabled,
  );

  useEffect(() => {
    const media = node;
    if (!media) return;
    const patch = (p: Partial<MediaElementState>) => setState((s) => ({ ...s, ...p }));
    const dur = () => (Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0);

    const onLoaded = () =>
      patch({ duration: dur(), ready: true, volume: media.volume, muted: media.muted, rate: media.playbackRate });
    const onDuration = () => patch({ duration: dur() });
    const onPlay = () => patch({ playing: true, ended: false });
    const onPause = () => patch({ playing: false });
    const onEnded = () => patch({ playing: false, ended: true });
    const onWaiting = () => patch({ waiting: true });
    const onPlaying = () => patch({ waiting: false, playing: true, ended: false });
    const onTime = () => {
      if (!scrubbingRef.current) patch({ current: media.currentTime });
    };
    const onProgress = () => {
      const b = media.buffered;
      if (b.length) patch({ buffered: b.end(b.length - 1) });
    };
    const onVolume = () => patch({ volume: media.volume, muted: media.muted });
    const onRate = () => patch({ rate: media.playbackRate });
    const onEnterPip = () => patch({ pip: true });
    const onLeavePip = () => patch({ pip: false });
    const onError = () => patch({ error: true, waiting: false });

    media.addEventListener('loadedmetadata', onLoaded);
    media.addEventListener('durationchange', onDuration);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('playing', onPlaying);
    media.addEventListener('timeupdate', onTime);
    media.addEventListener('progress', onProgress);
    media.addEventListener('volumechange', onVolume);
    media.addEventListener('ratechange', onRate);
    media.addEventListener('enterpictureinpicture', onEnterPip);
    media.addEventListener('leavepictureinpicture', onLeavePip);
    media.addEventListener('error', onError, true);

    // Стартовая синхронизация (метаданные/громкость могли подъехать до подписки).
    patch({ volume: media.volume, muted: media.muted, rate: media.playbackRate });
    if (media.readyState >= 1) onLoaded();

    return () => {
      media.removeEventListener('loadedmetadata', onLoaded);
      media.removeEventListener('durationchange', onDuration);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('progress', onProgress);
      media.removeEventListener('volumechange', onVolume);
      media.removeEventListener('ratechange', onRate);
      media.removeEventListener('enterpictureinpicture', onEnterPip);
      media.removeEventListener('leavepictureinpicture', onLeavePip);
      media.removeEventListener('error', onError, true);
    };
  }, [node]);

  // Плавная заливка прогресса: тянем currentTime каждый кадр, пока играет.
  useEffect(() => {
    if (!state.playing) return;
    const media = el.current;
    if (!media) return;
    let raf = 0;
    const loop = () => {
      if (!scrubbingRef.current) {
        const t = media.currentTime;
        setState((s) => (s.current === t ? s : { ...s, current: t }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.playing, node]);

  const toggle = useCallback(() => {
    const media = el.current;
    if (!media) return;
    if (media.paused) {
      // play() — промис: гасим AbortError/NotAllowedError (быстрый тоггл/политика автоплея).
      void media.play().catch(() => setState((s) => ({ ...s, playing: false })));
    } else {
      media.pause();
    }
  }, []);

  const seek = useCallback((sec: number) => {
    const media = el.current;
    if (!media) return;
    // При неизвестной длительности (стрим/live) не клампим сверху — пусть решает браузер.
    const known = Number.isFinite(media.duration) && media.duration > 0;
    const t = known ? Math.max(0, Math.min(sec, media.duration)) : Math.max(0, sec);
    media.currentTime = t;
    setState((s) => ({ ...s, current: t, ended: false }));
  }, []);

  const setVolume = useCallback((v: number) => {
    const media = el.current;
    if (!media) return;
    const vol = Math.max(0, Math.min(1, v));
    media.volume = vol;
    if (vol > 0 && media.muted) media.muted = false;
  }, []);

  const toggleMute = useCallback(() => {
    const media = el.current;
    if (!media) return;
    media.muted = !media.muted;
  }, []);

  const setRate = useCallback((r: number) => {
    const media = el.current;
    if (!media) return;
    media.playbackRate = r;
  }, []);

  // PiP — только для <video>; гасим отказы (нет жеста, запрет, неподдержка).
  const togglePip = useCallback(() => {
    const media = el.current;
    if (!media || !('requestPictureInPicture' in media)) return;
    const video = media as HTMLVideoElement;
    if (document.pictureInPictureElement === video) {
      void document.exitPictureInPicture().catch(() => {});
    } else {
      void video.requestPictureInPicture().catch(() => {});
    }
  }, []);

  const replay = useCallback(() => {
    const media = el.current;
    if (!media) return;
    media.currentTime = 0;
    void media.play().catch(() => {});
  }, []);

  const beginScrub = useCallback(() => {
    scrubbingRef.current = true;
    setState((s) => (s.scrubbing ? s : { ...s, scrubbing: true }));
  }, []);
  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
    setState((s) => (s.scrubbing ? { ...s, scrubbing: false } : s));
  }, []);

  return {
    ...state,
    toggle,
    seek,
    setVolume,
    toggleMute,
    setRate,
    togglePip,
    replay,
    beginScrub,
    endScrub,
    pipSupported,
    attach,
    el,
  };
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
