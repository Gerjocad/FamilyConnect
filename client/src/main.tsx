import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initDeepLinks } from './deepLinks';
import { watchForNewVersion } from './freshness';
import { SessionProvider } from './session';
import './styles.css';
import { applyStoredTheme } from './themes';

// Vor dem ersten Zeichnen, damit nichts in der falschen Farbe aufblitzt
applyStoredTheme();
initDeepLinks();
watchForNewVersion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>
);
