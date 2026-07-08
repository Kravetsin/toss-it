import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CosmeticsDrawer } from '@/components/CosmeticsDrawer';

/**
 * Single app-wide cosmetics shop drawer. Any surface (wallet chip, compose-form
 * voice CTA, future upsells) opens the same instance via useShop().
 */
const ShopContext = createContext<{ openShop: () => void }>({ openShop: () => {} });

export function ShopProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openShop = useCallback(() => setOpen(true), []);
  return (
    <ShopContext.Provider value={{ openShop }}>
      {children}
      <CosmeticsDrawer open={open} onClose={() => setOpen(false)} />
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
