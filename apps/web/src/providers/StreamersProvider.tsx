import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { StreamersDrawer } from '@/components/StreamersDrawer';

/**
 * Single app-wide streamer-directory drawer, same shape as the shop: the viewer's profile menu and
 * the streamer's sidebar open the one instance via useStreamers().
 */
const StreamersContext = createContext<{ openStreamers: () => void }>({ openStreamers: () => {} });

export function StreamersProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openStreamers = useCallback(() => setOpen(true), []);
  return (
    <StreamersContext.Provider value={{ openStreamers }}>
      {children}
      <StreamersDrawer open={open} onClose={() => setOpen(false)} />
    </StreamersContext.Provider>
  );
}

export function useStreamers() {
  return useContext(StreamersContext);
}
