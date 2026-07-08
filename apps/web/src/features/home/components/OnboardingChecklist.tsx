import { useEffect, useState } from 'react';
import type { OnboardingStatus } from '@tmw/shared';
import { getOnboarding } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';

/**
 * New-streamer checklist. An unfinished list nags (Zeigarnik) and answers
 * "what do I do here?"; disappears entirely once every step is done.
 */
export function OnboardingChecklist({
  channelId,
  botLogin,
}: {
  channelId: string;
  /** Bot login for the /mod hint; step hidden when the bot isn't configured. */
  botLogin: string | null;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOnboarding(channelId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (!status) return null;
  const steps = [
    { done: status.overlayAdded, label: t('onboard.step1') },
    { done: status.hasViewerSend, label: t('onboard.step2') },
    ...(status.botAvailable && botLogin
      ? [{ done: status.botReading, label: t('onboard.step3', { bot: botLogin }) }]
      : []),
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card corners className="border-accent/30">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2">
          <Icon name="sparkles" size={18} className="text-accent" />
          {t('onboard.title')}
        </h2>
        <span className="label-mono text-muted">
          {doneCount}/{steps.length}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                s.done ? 'border-ok/40 bg-ok-soft text-ok' : 'border-border text-faint'
              }`}
            >
              {s.done ? <Icon name="check" size={12} /> : <span className="text-xs">{i + 1}</span>}
            </span>
            <span className={s.done ? 'text-muted line-through' : 'text-text'}>{s.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
