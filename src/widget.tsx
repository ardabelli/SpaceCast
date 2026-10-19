// Uçan ikiz penceresi: her zaman üstte duran küçük sohbet penceresi.
// Chrome/Edge'de "Document Picture-in-Picture" ile açılır (başka uygulamalara geçince de ekranda kalır).
// Desteklemeyen tarayıcılarda (Safari) küçük bir açılır pencereye düşer.

import { createRoot, type Root } from 'react-dom/client';
import { TWIN_ID } from '../shared/seed.ts';
import { applyAccent } from './accents.ts';
import { showToast, useStore } from './store.ts';
import { Chat } from './views/Chat.tsx';

let pip: Window | null = null;
let root: Root | null = null;

export const canFloat = () => 'documentPictureInPicture' in window;

function copyStyles(target: Document) {
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    if (node instanceof HTMLLinkElement) {
      const l = target.createElement('link');
      l.rel = 'stylesheet';
      l.href = node.href; // mutlak adres: PiP belgesinin kendi adresi yok
      target.head.appendChild(l);
    } else {
      target.head.appendChild(node.cloneNode(true));
    }
  }
}

export async function openFloating() {
  if (pip && !pip.closed) {
    pip.focus();
    return;
  }
  if (!canFloat()) {
    popup('Her zaman üstte kalan pencere için uygulamayı Chrome ile aç; bu tarayıcıda normal pencere açıldı.');
    return;
  }
  try {
    const w: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 400, height: 620 });
    pip = w;
    copyStyles(w.document);
    applyAccent(useStore.getState().accent, w.document);
    const unsub = useStore.subscribe((s, prev) => { if (s.accent !== prev.accent) applyAccent(s.accent, w.document); });
    w.addEventListener('pagehide', unsub);
    w.document.title = useStore.getState().state?.agents.find((a) => a.id === TWIN_ID)?.name ?? 'SpaceCast';
    w.document.documentElement.lang = 'tr';
    w.document.body.className = 'pip';
    const el = w.document.createElement('div');
    el.id = 'pip-root';
    w.document.body.appendChild(el);
    root = createRoot(el);
    root.render(<Chat docked widget />);
    w.addEventListener('pagehide', () => {
      root?.unmount();
      root = null;
      pip = null;
    });
  } catch {
    popup('Üstte kalan pencere açılamadı; normal küçük pencere açıldı.');
  }
}

function popup(note: string) {
  const w = window.open(`${location.origin}/#widget`, 'spacecast-widget', 'popup,width=400,height=640');
  showToast(w ? note : 'Açılır pencere engellendi. Tarayıcı ayarlarından bu siteye izin ver.');
}
