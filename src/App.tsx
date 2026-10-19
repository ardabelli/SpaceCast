import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.tsx';
import { useStore, useTwinName, type View } from './store.ts';
import { money } from './ui.tsx';
import { AccessModal } from './views/AccessModal.tsx';
import { AgentDrawer } from './views/AgentDrawer.tsx';
import { Approvals } from './views/Approvals.tsx';
import { Base } from './views/Base.tsx';
import { Chat } from './views/Chat.tsx';
import { ConnectModal } from './views/ConnectModal.tsx';
import { Logs } from './views/Logs.tsx';
import { MapView } from './views/MapView.tsx';
import { MissionModal } from './views/MissionModal.tsx';
import { Missions } from './views/Missions.tsx';
import { TeamModal } from './views/TeamModal.tsx';
import { LoginScreen, Setup, SettingsModal, stopServer } from './views/Setup.tsx';
import { Space } from './views/Space.tsx';
import { openFloating } from './widget.tsx';
import { Teams } from './views/Teams.tsx';

const NAV: { id: View; label: string }[] = [
  { id: 'base', label: 'Üs' },
  { id: 'twin', label: '' },
  { id: 'map', label: 'Ağ' },
  { id: 'missions', label: 'Görevler' },
  { id: 'approvals', label: 'Onaylar' },
  { id: 'teams', label: 'Ekipler' },
  { id: 'logs', label: 'Kayıtlar' },
];

const DOCK_KEY = 'army-dock-width';

/** Sağdaki sohbet panelinin genişliği: sol kenarından sürüklenerek değişir, tarayıcıda hatırlanır. */
function useDockWidth() {
  const [w, setW] = useState(() => {
    try { return Number(localStorage.getItem(DOCK_KEY)) || 440; } catch { return 440; }
  });
  const drag = useRef<{ x: number; w: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.max(320, Math.min(v, window.innerWidth * 0.65)));
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, w };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setW(clamp(drag.current.w + (drag.current.x - e.clientX)));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove('resizing');
    try { localStorage.setItem(DOCK_KEY, String(w)); } catch { /* yok say */ }
  };
  const reset = () => { setW(440); try { localStorage.setItem(DOCK_KEY, '440'); } catch { /* yok say */ } };
  return { w, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: reset } };
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function App() {
  const state = useStore((s) => s.state);
  const view = useStore((s) => s.view);
  const go = useStore((s) => s.go);
  const connected = useStore((s) => s.connected);
  const modal = useStore((s) => s.modal);
  const openModal = useStore((s) => s.openModal);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const toast = useStore((s) => s.toast);
  const settings = useStore((s) => s.settings);
  const needsKey = useStore((s) => s.needsKey);
  const twinName = useTwinName();
  const time = useClock();
  // Pencere ya da ajan paneli açıkken arkadaki animasyonları duraklat (styles.css: body.overlay-open)
  useEffect(() => {
    document.body.classList.toggle('overlay-open', !!modal || !!selectedAgentId);
  }, [modal, selectedAgentId]);
  const dock = useDockWidth();

  // Uçan pencere desteklenmeyen tarayıcılarda açılan küçük pencere
  if (state && location.hash === '#widget') {
    return (
      <div className="widget-shell">
        <Chat docked widget />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }

  if (needsKey) return <><Space /><LoginScreen /></>;

  if (!state || !settings) {
    return (
      <div className="connect-screen">
        <div className="col" style={{ alignItems: 'center', gap: 12 }}>
          <h2 className="glow-title">SpaceCast</h2>
          <p className="muted blink">Sunucuya bağlanılıyor…</p>
          <p className="dim" style={{ maxWidth: 400 }}>
            SpaceCast sunucusu kapalı olabilir. Bilgisayarda SpaceCast kısayoluna tıkla ya da klasörde <span className="mono">npm start</span> çalıştır.
            Telefondan bağlanıyorsan Tailscale açık mı, kontrol et.
          </p>
        </div>
      </div>
    );
  }

  if (!settings.done) return <><Space /><Setup /></>;

  const pending = state.approvals.filter((a) => a.status === 'pending').length;
  const spent = state.agents.reduce((n, a) => n + a.spent, 0);

  const body = {
    base: <Base />,
    twin: <Chat />,
    map: <MapView />,
    teams: <Teams />,
    missions: <Missions />,
    approvals: <Approvals />,
    logs: <Logs />,
  }[view];
  const flush = view === 'base' || view === 'map' || view === 'twin';

  return (
    <div className="shell">
      <Space />
      <header className="hud">
        <div className="hud-brand" onClick={() => go('base')} title="SpaceCast">
          <span className="hud-logo">◈</span>
          <span className="hud-name">SpaceCast</span>
        </div>

        <nav className="tabs">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => go(n.id)}>
              {n.id === 'twin' ? twinName : n.label}
              {n.id === 'approvals' && pending > 0 && <span className="badge count">{pending}</span>}
            </button>
          ))}
        </nav>

        <div className="hud-right">
          <span className="hud-stat hide-m" title="Yapay zekâ kullanımı (Claude'da liste fiyatı karşılığı; diğer sağlayıcılarda hesaplanmaz)">
            <span>Harcama</span><b>{money(spent)}</b>
          </span>
          <button className="icon-btn hide-m" title={`${twinName} ile uçan pencerede konuş (her zaman üstte)`} onClick={() => openFloating()}>
            <Icon name="float" />
          </button>
          <button className="icon-btn hide-m" title="Telefona bağlan" onClick={() => openModal({ kind: 'connect' })}><Icon name="phone" /></button>
          <button className="icon-btn" title="Ayarlar" onClick={() => openModal({ kind: 'settings' })}><Icon name="settings" /></button>
          <button className="icon-btn hide-m" title="Sunucuyu kapat" onClick={stopServer}><Icon name="power" /></button>
          <span className={`hud-clock hide-m ${connected ? '' : 'off'}`} title={connected ? 'Sunucuya bağlı' : 'Bağlantı yok'}>
            <i className={`dot ${connected ? 'on' : 'off'}`} />
            {connected ? time : 'Bağlantı yok'}
          </span>
        </div>
      </header>

      <div className="body">
        <main className={`content ${flush ? 'flush' : ''}`}>{body}</main>
        {view !== 'twin' && view !== 'map' && (
          <aside className="dock" style={{ width: dock.w }}>
            <div className="dock-resize" title="Sürükleyerek genişlet · çift tıkla: varsayılan" {...dock.handle} />
            <Chat docked />
          </aside>
        )}
      </div>

      {selectedAgentId && <AgentDrawer key={selectedAgentId} id={selectedAgentId} />}
      {modal?.kind === 'mission' && <MissionModal ownerId={modal.ownerId} />}
      {modal?.kind === 'team' && <TeamModal teamId={modal.teamId} />}
      {modal?.kind === 'connect' && <ConnectModal />}
      {modal?.kind === 'access' && <AccessModal />}
      {modal?.kind === 'settings' && <SettingsModal />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
