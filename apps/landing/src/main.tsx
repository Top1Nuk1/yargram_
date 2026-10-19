import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

if (typeof window !== 'undefined' && window.location.hash.startsWith('#theme=')) {
  window.location.replace(`/app${window.location.hash}`);
}

const root = document.getElementById('root');

if (!root) throw new Error('Root element was not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
