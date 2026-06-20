import { useCallback, useEffect, useState } from 'react';
import type { ChannelSettings } from '@tmw/shared';
import { getSettings, saveSettings } from '@/lib/api';

/** Load/save channel settings for standalone settings pages. Local state; no duplication with useChannelData. */
export function useSettingsData(channelId: string | null, isOwner: boolean) {
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId || !isOwner) {
      setSettings(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getSettings(channelId)
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, isOwner]);

  const save = useCallback(
    async (patch: Partial<ChannelSettings>) => {
      if (!channelId) return;
      const updated = await saveSettings(channelId, patch);
      setSettings(updated);
      return updated;
    },
    [channelId],
  );

  return { settings, loading, save };
}
