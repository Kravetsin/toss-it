import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { I18nProvider, LanguageSwitcher } from './i18n';
import { HomePage } from './pages/HomePage';
import { ChannelPage } from './pages/ChannelPage';
import { DashboardPage } from './pages/DashboardPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/c/:login" element={<ChannelPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </BrowserRouter>
      {/* Виден на всех страницах */}
      <LanguageSwitcher />
    </I18nProvider>
  </StrictMode>,
);
