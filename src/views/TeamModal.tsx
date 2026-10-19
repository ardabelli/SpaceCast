import { useState } from 'react';
import { uid } from '../../shared/engine.ts';
import { TEAM_COLORS, THEMES, themeOf } from '../../shared/meta.ts';
import type { TeamTheme } from '../../shared/types.ts';
import { useAppState, useStore } from '../store.ts';
import { Modal } from '../ui.tsx';
import { Icon, TEAM_ICONS } from '../icons.tsx';


export function TeamModal({ teamId }: { teamId?: string }) {
  const s = useAppState();
  const { dispatch, openModal } = useStore.getState();
  const existing = s.teams.find((t) => t.id === teamId);
  const [name, setName] = useState(existing?.name ?? '');
  const [goal, setGoal] = useState(existing?.goal ?? '');
  const [icon, setIcon] = useState<string>(existing?.icon ?? 'target');
  const [theme, setTheme] = useState<TeamTheme>(themeOf(existing));
  const [color, setColor] = useState(existing?.color ?? TEAM_COLORS[s.teams.length % TEAM_COLORS.length]);
  const close = () => openModal(null);

  const save = () => {
    if (!name.trim()) return;
    if (existing) dispatch({ type: 'team/update', id: existing.id, patch: { name: name.trim(), goal, icon, color, theme } });
    else dispatch({ type: 'team/add', team: { id: uid('t-'), name: name.trim(), goal, icon, color, theme, revenue: 0, boost: false } });
    close();
  };

  return (
    <Modal
      title={existing ? 'Takımı düzenle' : 'Yeni takım'}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              style={{ marginRight: 'auto' }}
              onClick={() => { dispatch({ type: 'team/delete', id: existing.id }); close(); }}
            >
              Takımı dağıt
            </button>
          )}
          <button className="btn ghost" onClick={close}>Vazgeç</button>
          <button className="btn primary" disabled={!name.trim()} onClick={save}>Kaydet</button>
        </>
      }
    >
      <label className="field">
        <span>Takım adı</span>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Pazarlama Birliği" />
      </label>
      <label className="field">
        <span>Amaç</span>
        <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Bu takım ne için var?" />
      </label>
      <div className="field">
        <span>Simge</span>
        <div className="chips">
          {TEAM_ICONS.map((i) => (
            <button key={i} className={`chip icon-chip ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)} aria-label={i}>
              <Icon name={i} size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Oda tipi</span>
        <div className="chips">
          {(Object.keys(THEMES) as TeamTheme[]).map((t) => (
            <button key={t} className={`chip ${theme === t ? 'on' : ''}`} onClick={() => setTheme(t)} title={THEMES[t].hint}>{THEMES[t].label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Renk</span>
        <div className="chips">
          {TEAM_COLORS.map((c) => (
            <button
              key={c}
              className={`chip ${color === c ? 'on' : ''}`}
              style={{ width: 30, height: 30, padding: 0, background: c, borderColor: color === c ? 'white' : c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
