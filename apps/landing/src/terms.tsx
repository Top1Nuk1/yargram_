import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TermsPage } from './components/TermsPage';
import { LanguageProvider } from './lib/useLandingLanguage';
import './index.css';

/**
 * 🔥 Отдельная точка входа для соглашения: `terms.html` в корне сборки
 * получает собственный бандл, и сервер отдаёт `/terms` готовым файлом.
 * Смешивать со `main.tsx` нельзя — иначе соглашение уехало бы на адрес
 * лендинга и перестало быть документом со своим собственным адресом.
 */
const root = document.getElementById('root');

if (!root) throw new Error('Root element was not found');

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <TermsPage />
    </LanguageProvider>
  </StrictMode>,
);