import { useEffect, useState } from 'react';
import type { AccessibleChannel } from '@tmw/shared';
import { getMyChannels } from '@/lib/api';

// Hook: list of accessible channels (owned + moderated), selected channel persisted via localStorage.
// Returns: channelsList/list/current, channelId, isOwner, and setCurrentId control.
export function useChannels() {
  const [channelsList, setChannelsList] = useState<AccessibleChannel[] | 'loading'>('loading');
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('tmw_dash_channel');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    void getMyChannels()
      .then((ch) => {
        setChannelsList(ch);
        setCurrentId((prev) =>
          prev && ch.some((c) => c.channelId === prev) ? prev : (ch[0]?.channelId ?? null),
        );
      })
      .catch(() => setChannelsList([]));
  }, []);

  const list = Array.isArray(channelsList) ? channelsList : [];
  const current = list.find((c) => c.channelId === currentId) ?? list[0] ?? null;
  const channelId = current?.channelId ?? null;
  const isOwner = current?.role === 'owner';

  useEffect(() => {
    if (channelId) {
      try {
        localStorage.setItem('tmw_dash_channel', channelId);
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [channelId]);

  return { channelsList, list, current, channelId, isOwner, setCurrentId };
}
