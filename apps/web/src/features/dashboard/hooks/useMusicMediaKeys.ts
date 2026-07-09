import { useEffect, useRef, useState } from 'react';
import type { MusicCommand, MusicState, MusicTrack } from '@tmw/shared';
import { sendMusicCommand } from '@/lib/api';

/**
 * Wire hardware media keys (and the OS media overlay / lock-screen controls) to the background
 * music. The player itself lives in the OBS overlay, so this tab has no audio of its own — but
 * the OS only routes media keys to a tab that is actively playing media. A near-silent looping
 * track keeps a Media Session alive purely to receive those keys; each press is forwarded to the
 * same command channel the on-screen buttons use.
 *
 * Returns the arming status so the UI can surface it: autoplay is gesture-gated, so until the
 * streamer clicks the page once the session cannot start ('waiting'), then it stays 'armed'.
 */
export type MediaKeysStatus = 'unsupported' | 'waiting' | 'armed';

/**
 * Looping 16-bit PCM WAV as a data URI. NOT digital zeros: some Chrome builds refuse media-key
 * focus to playback they classify as inaudible, so this carries a 30 Hz tone at 4/32768 amplitude
 * (≈ -78 dBFS) — real signal for the audibility heuristic, imperceptible on any speaker.
 */
function nearSilentWavDataUri(seconds = 8): string {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const dataLen = samples * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < samples; i++) {
    dv.setInt16(44 + i * 2, Math.round(4 * Math.sin((2 * Math.PI * 30 * i) / rate)), true);
  }
  let bin = '';
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export function useMusicMediaKeys(
  channelId: string | null,
  musicState: MusicState,
  tracks: MusicTrack[],
  enabled: boolean,
): MediaKeysStatus {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<MediaKeysStatus>('unsupported');
  const hasTracks = tracks.length > 0;

  // Claim the Media Session: near-silent loop + action handlers. Kept alive all session long.
  useEffect(() => {
    if (!enabled || !channelId || !hasTracks || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    setStatus('waiting');

    const audio = new Audio(nearSilentWavDataUri());
    audio.loop = true;
    audioRef.current = audio;

    // Autoplay is gesture-gated; try now (a prior click on the origin unlocks it), else on the
    // next interaction — and stop listening the moment playback takes.
    const start = () => {
      void audio
        .play()
        .then(() => {
          setStatus('armed');
          window.removeEventListener('pointerdown', start);
          window.removeEventListener('keydown', start);
        })
        .catch(() => {});
    };
    start();
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);

    const send = (cmd: MusicCommand) => void sendMusicCommand(channelId, cmd).catch(() => {});
    ms.setActionHandler('play', () => send({ action: 'play' }));
    ms.setActionHandler('pause', () => send({ action: 'pause' }));
    ms.setActionHandler('nexttrack', () => send({ action: 'next' }));
    ms.setActionHandler('previoustrack', () => send({ action: 'prev' }));
    ms.setActionHandler('seekto', (d) => {
      if (typeof d.seekTime === 'number') send({ action: 'seek', seconds: Math.round(d.seekTime) });
    });

    return () => {
      setStatus('unsupported');
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto'] as const) {
        ms.setActionHandler(a, null);
      }
      ms.metadata = null;
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [enabled, channelId, hasTracks]);

  // Mirror the live state (title, artwork, play/pause, position) into the OS controls.
  useEffect(() => {
    if (!enabled || !hasTracks || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    // Keep the silent loop running even while paused, so keys stay routed to us.
    const audio = audioRef.current;
    if (audio?.paused) void audio.play().catch(() => {});

    ms.playbackState = musicState.playing ? 'playing' : 'paused';

    // Metadata is set even while idle, so the session shows up in the OS media hub right away.
    const current = tracks.find((tr) => tr.videoId === musicState.videoId);
    if ('MediaMetadata' in window) {
      ms.metadata = new MediaMetadata({
        title: current?.title ?? 'Tossit',
        artist: 'Tossit',
        artwork: current
          ? [
              {
                src: `https://i.ytimg.com/vi/${current.videoId}/mqdefault.jpg`,
                sizes: '320x180',
                type: 'image/jpeg',
              },
            ]
          : [],
      });
    }

    const { positionSec, durationSec } = musicState;
    if (
      typeof durationSec === 'number' &&
      durationSec > 0 &&
      typeof positionSec === 'number' &&
      'setPositionState' in ms
    ) {
      try {
        ms.setPositionState({
          duration: durationSec,
          position: Math.min(positionSec, durationSec),
          playbackRate: 1,
        });
      } catch {
        // setPositionState throws on inconsistent values (e.g. mid-track-switch) — ignore.
      }
    }
  }, [enabled, hasTracks, musicState, tracks]);

  return status;
}
