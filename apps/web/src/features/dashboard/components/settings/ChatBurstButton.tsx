import { useEffect, useRef, useState } from 'react';
import { sendTestChatMessage } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/ui';
import { Icon } from '@/ui/icons';

/** Slow enough to read a line before the next one lands, quick enough to fill the box. */
const STEP_MS = 1600;
/**
 * Hard stop. Unmounting is not a reliable brake: Accordion keeps its children mounted once opened,
 * so collapsing this section would otherwise leave the stream running with the Stop button hidden.
 */
const MAX_MS = 60_000;

/**
 * Streams sample chat lines at the chat overlay until pressed again. The cadence is driven here,
 * not on the server: the whole point is to tune the sliders next to this button while lines keep
 * coming, so "this page is open" is exactly the right lifetime for the stream.
 */
export function ChatBurstButton({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const timer = useRef(0);
  const index = useRef(0);

  const stop = () => {
    window.clearInterval(timer.current);
    timer.current = 0;
    setRunning(false);
  };

  // Leaving the page (or the accordion) must not leave a stream running with no way to stop it.
  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = () => {
    index.current = 0;
    setRunning(true);
    const deadline = Date.now() + MAX_MS;
    const tick = () => {
      if (Date.now() > deadline) {
        stop();
        return;
      }
      sendTestChatMessage(channelId, index.current++).catch((err: unknown) => {
        stop();
        toast(err instanceof Error ? err.message : String(err), 'danger');
      });
    };
    tick();
    timer.current = window.setInterval(tick, STEP_MS);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant={running ? 'danger' : 'secondary'} onClick={running ? stop : start}>
        <Icon name={running ? 'close' : 'message-circle'} size={16} />
        {running ? t('dash.chatBurstStop') : t('dash.chatBurstStart')}
      </Button>
      <p className="text-xs text-muted">{t('dash.chatBurstNote')}</p>
    </div>
  );
}
