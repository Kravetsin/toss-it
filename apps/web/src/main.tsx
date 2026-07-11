import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { injectCosmeticsStyles, injectLevelStyles } from '@tmw/shared';
import './index.css';
import { installDevMock } from '@/lib/devMock';
import { ConfirmProvider } from '@/providers/ConfirmProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { MeProvider } from '@/providers/MeProvider';
import { ShopProvider } from '@/providers/ShopProvider';
import { NotificationsProvider } from '@/providers/NotificationsProvider';
import { AppShell } from '@/components/AppShell';
import { DustClaimedToast } from '@/components/DustClaimedToast';
import { I18nProvider, LanguageSwitcher } from './i18n';
import { HomePage } from './pages/HomePage';
import { ChannelPage } from './pages/ChannelPage';
import { DashboardPage } from './pages/DashboardPage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ModInvitePage } from './pages/ModInvitePage';
import { LinkConfirmPage } from './pages/LinkConfirmPage';
import { PromoCodePage } from './pages/PromoCodePage';
import { AdminPage } from './pages/AdminPage';
import { GalleryPage } from './pages/GalleryPage';

// Dev mock via ?mock=1 — test logged-in UI without backend.
installDevMock();

// Cosmetic effect styles (card/nick effects) are injected from the shared registry so the CSS
// lives with each effect module and isn't duplicated across web + overlay.
injectCosmeticsStyles();
injectLevelStyles();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <MeProvider>
            <ShopProvider>
              <BrowserRouter>
                <NotificationsProvider>
                  <Routes>
                    {/* Streamer routes inside persistent AppShell (sidebar). */}
                    <Route element={<AppShell />}>
                      <Route path="/" element={<HomePage />} />
                      {/* Localized landing entry URLs (SEO + hreflang); language picked in detectInitial. */}
                      <Route path="/ru" element={<HomePage />} />
                      <Route path="/uk" element={<HomePage />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/dashboard/stats" element={<StatsPage />} />
                      <Route path="/dashboard/settings" element={<SettingsPage />} />
                      <Route path="/dashboard/settings/:section" element={<SettingsPage />} />
                    </Route>
                    {/* Public routes: no AppShell. */}
                    <Route path="/c/:login" element={<ChannelPage />} />
                    <Route path="/mod-invite/:token" element={<ModInvitePage />} />
                    <Route path="/link/confirm" element={<LinkConfirmPage />} />
                    <Route path="/promo" element={<PromoCodePage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    {import.meta.env.DEV && <Route path="/_gallery" element={<GalleryPage />} />}
                  </Routes>
                  <LanguageSwitcher />
                  <DustClaimedToast />
                </NotificationsProvider>
              </BrowserRouter>
            </ShopProvider>
          </MeProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
