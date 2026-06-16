import { useEffect, useRef, useState } from 'react';
import { initAudioUnlock, playNotify } from '@/lib/notify';

/**
 * Звуковое уведомление дашборда: булев флаг с запоминанием в localStorage + ref-зеркало,
 * чтобы обработчик сокета читал актуальное значение без переподключения при переключении.
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
    if (next) playNotify(); // дать услышать и заодно разблокировать аудио
  };

  return { soundOn, soundOnRef, toggle };
}
