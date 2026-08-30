import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { RouletteDrawer } from '@/features/roulette/components/RouletteDrawer';

/**
 * One app-wide wheel, opened from anywhere via useRoulette() — the same shape as the shop, so a
 * second entry point later costs one call rather than a second instance of the drawer.
 */
const RouletteContext = createContext<{ openRoulette: () => void }>({ openRoulette: () => {} });

export function RouletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openRoulette = useCallback(() => setOpen(true), []);
  return (
    <RouletteContext.Provider value={{ openRoulette }}>
      {children}
      <RouletteDrawer open={open} onClose={() => setOpen(false)} />
    </RouletteContext.Provider>
  );
}

export function useRoulette() {
  return useContext(RouletteContext);
}
