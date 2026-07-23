import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { FRESH_IDS, loadSeen, saveSeen } from '@/lib/whatsNew';

/**
 * App-wide "what's new" state. Lives above the shop drawer on purpose: the wallet button outside
 * the drawer has to stop glowing the moment the row inside it is read, and both read the same set.
 */
interface WhatsNew {
  /** A single catalog entry: fresh AND not yet read. */
  isNew: (id: string) => boolean;
  /** Any of these — how a tab, a group or the shop button inherits its children's dot. */
  hasNew: (ids?: readonly string[]) => boolean;
  markSeen: (id: string) => void;
}

const WhatsNewContext = createContext<WhatsNew>({
  isNew: () => false,
  hasNew: () => false,
  markSeen: () => {},
});

export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(loadSeen);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      saveSeen(next);
      return next;
    });
  }, []);

  const value = useMemo<WhatsNew>(() => {
    const isNew = (id: string) => FRESH_IDS.has(id) && !seen.has(id);
    return {
      isNew,
      // No ids = the whole catalog, which is what the shop entry points ask about.
      hasNew: (ids) => (ids ?? [...FRESH_IDS]).some(isNew),
      markSeen,
    };
  }, [seen, markSeen]);

  return <WhatsNewContext.Provider value={value}>{children}</WhatsNewContext.Provider>;
}

export function useWhatsNew() {
  return useContext(WhatsNewContext);
}
