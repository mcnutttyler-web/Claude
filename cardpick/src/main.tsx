import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Ask the browser not to evict CardPick's data (best effort; some browsers need a user gesture).
void navigator.storage?.persist?.().catch(() => undefined);
