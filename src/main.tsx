import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { applyAccent } from './accents.ts';
import { App } from './App.tsx';
import { connect, useStore } from './store.ts';

// Vurgu rengi ilk karede uygulansın (yeşilden geçiş görünmesin), değişince güncellensin
applyAccent(useStore.getState().accent);
useStore.subscribe((s, prev) => { if (s.accent !== prev.accent) applyAccent(s.accent); });

connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
