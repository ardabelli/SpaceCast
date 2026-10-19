import type { ReactNode } from 'react';
import { Icon } from './icons.tsx';
import { agentStatus, type AgentStatus } from '../shared/engine.ts';
import { MODELS } from '../shared/meta.ts';
import { PROVIDERS, modelTier, type PublicSettings } from '../shared/providers.ts';
import type { Agent, AppState, ModelId } from '../shared/types.ts';
import { Npc, sheetFor } from './npc.tsx';
import { useStore } from './store.ts';

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Boşta',
  working: 'Çalışıyor',
  managing: 'Yönetiyor',
  waiting: 'Onay bekliyor',
  paused: 'Duraklatıldı',
};

const STATUS_BADGE: Record<AgentStatus, string> = {
  idle: '',
  working: 'info',
  managing: 'accent',
  waiting: 'warn',
  paused: '',
};

/** Ajanın NPC portresi (odasının temasına göre giyinmiş; ikiz nükleer şövalye). */
export function Avatar({ agent, size, status }: { agent: Agent; size?: 'sm' | 'lg'; status?: AgentStatus }) {
  const s = useStore((x) => x.state);
  const scale = size === 'sm' ? 1 : size === 'lg' ? 3 : 2;
  return (
    <div className={`avatar ${size ?? ''} ${agent.kind === 'twin' ? 'twin' : ''}`} style={{ ['--ac' as string]: agent.color }}>
      {s && <Npc sheet={sheetFor(s, agent)} scale={scale} className="portrait" />}
      {status && <i className={`status-dot s st-${status}`} />}
    </div>
  );
}

export function StatusBadge({ s, id }: { s: AppState; id: string }) {
  const st = agentStatus(s, id);
  return (
    <span className={`badge ${STATUS_BADGE[st]}`}>
      <i className={`status-dot st-${st}`} />
      {STATUS_LABEL[st]}
    </span>
  );
}

export function Bar({ value, ok }: { value: number; ok?: boolean }) {
  return (
    <div className={`bar ${ok ? 'ok' : ''}`}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-h">
          <h2 style={{ fontSize: 17 }} className="grow">{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      {children}
    </div>
  );
}

/** Ajan modelinin etiketi: Claude'da model adı, diğer sağlayıcılarda kademe (güçlü/dengeli/hızlı → ana ya da hızlı model). */
export function modelLabel(id: ModelId, s: PublicSettings | null, short = false) {
  const p = s?.provider;
  if (!p || PROVIDERS[p.id].engine === 'claude') return short ? MODELS[id].label.split(' ')[0] : MODELS[id].label;
  const tier = modelTier(id);
  const name = tier === 'fast' && p.fastModel ? p.fastModel : p.model ?? '';
  const label = { strong: 'Güçlü', balanced: 'Dengeli', fast: 'Hızlı' }[tier];
  return short ? label : `${label} · ${name}`;
}

export const money = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`;
export const kfmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export function clock(ts: number) {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ago(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s} sn önce`;
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86400)} gün önce`;
}
