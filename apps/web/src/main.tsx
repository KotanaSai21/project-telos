import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { AccessGate } from './components/AccessGate';
import './index.css';
import { applyTheme, initialTheme } from './theme';

applyTheme(initialTheme());

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <AccessGate>
      <App />
    </AccessGate>
  </StrictMode>,
);
