import { useState } from 'react';

type QueueView = 'list' | 'review';

/** Вид очереди: «Список» / «Разбор» с запоминанием выбора в localStorage. */
export function useQueueView(): [QueueView, (v: QueueView) => void] {
  const [view, setView] = useState<QueueView>(() =>
    localStorage.getItem('tmw_queueview') === 'review' ? 'review' : 'list',
  );
  const change = (v: QueueView) => {
    setView(v);
    try {
      localStorage.setItem('tmw_queueview', v);
    } catch {
      /* приватный режим — не критично */
    }
  };
  return [view, change];
}
