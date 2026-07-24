import { useEffect, useState } from 'react';
import type { OnboardingStatus } from '@tmw/shared';
import { getOnboarding } from '@/lib/api';

/** Owner-only setup state, shared by the home page's guide and the chat upsell card (one fetch). */
export function useOnboarding(channelId: string | null): OnboardingStatus | null {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  useEffect(() => {
    if (!channelId) return;
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
  return status;
}
