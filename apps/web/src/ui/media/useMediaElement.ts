import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Snapshot of <video>/<audio> state used to render custom controls. */
export interface MediaElementState {
  playing: boolean;
  current: number; // seconds
  duration: number; // seconds (0/infinite = unknown duration, e.g. live stream)
  buffered: number; // seconds buffered
  volume: number; // 0..1
  muted: boolean;
  rate: number; // playback rate (1 = normal)
  pip: boolean; // picture-in-picture active
  ready: boolean; // metadata loaded
  waiting: boolean; // buffering
  ended: boolean;
  error: boolean;
  scrubbing: boolean; // user dragging seek bar
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
 * Centralized playback for <video>/<audio>. Uses callback-ref `attach` (not RefObject)
 * so subscription re-initializes when element actually enters DOM (critical for portal-mounted media).
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
      patch({
        duration: dur(),
        ready: true,
        volume: media.volume,
        muted: media.muted,
        rate: media.playbackRate,
      });
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

    // Metadata/volume may already be loaded when subscription fires; sync initial state.
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

  // Smooth progress: pull currentTime each frame while playing.
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
      // play() returns a promise; suppress AbortError/NotAllowedError (quick toggle or autoplay policy).
      void media.play().catch(() => setState((s) => ({ ...s, playing: false })));
    } else {
      media.pause();
    }
  }, []);

  const seek = useCallback((sec: number) => {
    const media = el.current;
    if (!media) return;
    // Unknown duration (live): clamp only at 0; let browser decide max.
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

  // PiP for <video> only; suppress rejections (missing gesture, iframe restriction, etc.).
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
    // requestFullscreen/exitFullscreen return promises that may reject; suppress unhandled rejection.
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
