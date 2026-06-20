import { useEffect, useRef, useState } from 'react';
import { initAudioUnlock, playNotify } from '@/lib/notify';

/**
 * Boolean toggle with localStorage persistence + ref mirror to let socket handler
 * read fresh value without reconnect on state change.
 */
export function useSoundNotify() {
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('tmw_modsound') !== '0');
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  useEffect(() => {
    initAudioUnlock();
  }, []);

  const toggle = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('tmw_modsound', next ? '1' : '0');
    if (next) playNotify(); // Play to confirm + unlock audio in browser
  };

  return { soundOn, soundOnRef, toggle };
}
