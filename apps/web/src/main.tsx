import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { installDevMock } from '@/lib/devMock';
import { ConfirmProvider } from '@/providers/ConfirmProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { MeProvider } from '@/providers/MeProvider';
import { AppShell } from '@/components/AppShell';
import { I18nProvider, LanguageSwitcher } from './i18n';
import { HomePage } from './pages/HomePage';
import { ChannelPage } from './pages/ChannelPage';
import { DashboardPage } from './pages/DashboardPage';
import { ModInvitePage } from './pages/ModInvitePage';
import { PromoCodePage } from './pages/PromoCodePage';
import { AdminPage } from './pages/AdminPage';
import { GalleryPage } from './pages/GalleryPage';

// DEV-мок данных (для оценки залогиненного UI без бэкенда): ?mock=1. No-op в проде.
installDevMock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <MeProvider>
            <BrowserRouter>
              <Routes>
                {/* Стримерские маршруты — в постоянной оболочке (sidebar). */}
                <Route element={<AppShell />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                </Route>
                {/* Публичные/утилитарные — свой фрейм, без оболочки. */}
                <Route path="/c/:login" element={<ChannelPage />} />
                <Route path="/mod-invite/:token" element={<ModInvitePage />} />
                <Route path="/promo" element={<PromoCodePage />} />
                <Route path="/admin" element={<AdminPage />} />
                {import.meta.env.DEV && <Route path="/_gallery" element={<GalleryPage />} />}
              </Routes>
              {/* Виден на всех страницах */}
              <LanguageSwitcher />
            </BrowserRouter>
          </MeProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
