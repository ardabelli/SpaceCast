import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { applyAccent } from './accents.ts';
import { App } from './App.tsx';
import { onLivelyChange, startLife } from './life.ts';
import { connect, useStore } from './store.ts';

// Vurgu rengi ilk karede uygulansın (yeşilden geçiş görünmesin), değişince güncellensin
applyAccent(useStore.getState().accent);
document.body.classList.toggle('lively', useStore.getState().lively);
useStore.subscribe((s, prev) => {
  if (s.accent !== prev.accent) applyAccent(s.accent);
  if (s.lively !== prev.lively) { document.body.classList.toggle('lively', s.lively); onLivelyChange(s.lively); }
});
// Pil dostu modda karakterler ve reaktör saniyede birkaç karelik tek bir döngüyle hareket eder
startLife(() => useStore.getState().lively);

connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
