import { useEffect, useState } from 'react';
import { Icon } from '../icons.tsx';
import { currentActivity, descendants } from '../../shared/engine.ts';
import { AUTONOMY, KINDS, MODELS, TOOLS } from '../../shared/meta.ts';
import type { Agent, AgentKind, Autonomy, ModelId } from '../../shared/types.ts';
import { createAgent } from '../actions.ts';
import { useAppState, useStore } from '../store.ts';
import { Avatar, Bar, StatusBadge, kfmt, modelLabel, money } from '../ui.tsx';
import { EffortPicker } from './EffortPicker.tsx';
import { Feed } from './Logs.tsx';

/** Metin alanları yazarken sunucuya her tuşta gitmesin diye yerel taslak tutar, odaktan çıkınca kaydeder. */
function useDraft<T>(value: T, commit: (v: T) => void) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  return {
    value: draft,
    onChange: (v: T) => { setEditing(true); setDraft(v); },
    onBlur: () => { setEditing(false); if (draft !== value) commit(draft); },
  };
}

export function AgentDrawer({ id }: { id: string }) {
  const s = useAppState();
  const settings = useStore((x) => x.settings);
  const { dispatch, selectAgent, openModal } = useStore.getState();
  const a = s.agents.find((x) => x.id === id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectAgent(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectAgent]);

  const update = (patch: Partial<Agent>) => dispatch({ type: 'agent/update', id, patch });
  const name = useDraft(a?.name ?? '', (v) => update({ name: v.trim() || a!.name }));
  const role = useDraft(a?.role ?? '', (v) => update({ role: v }));
  const prompt = useDraft(a?.systemPrompt ?? '', (v) => update({ systemPrompt: v }));
  const budget = useDraft(String(a?.budget ?? 0), (v) => update({ budget: Math.max(0, Number(v) || 0) }));

  if (!a) return null;

  const close = () => selectAgent(null);
  const blocked = descendants(s, a.id);
  const managers = s.agents.filter((m) => m.id !== a.id && !blocked.has(m.id));
  const reports = s.agents.filter((r) => r.managerId === a.id);
  const act = currentActivity(s, a.id);
  const logs = s.logs.filter((l) => l.agentId === a.id || l.toAgentId === a.id).slice(-12).reverse();

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="drawer" aria-label={`${a.name} ayrıntıları`}>
        <div className="drawer-h">
          <Avatar agent={a} size="lg" />
          <div className="grow">
            <h2 style={{ fontSize: 17 }} lang={a.kind === 'twin' ? 'en' : undefined}>{a.name}</h2>
            <div className="row" style={{ marginTop: 3 }}>
              <span className="muted" style={{ fontSize: 13 }}>{a.role}</span>
              <StatusBadge s={s} id={a.id} />
            </div>
          </div>
          <button className="btn ghost icon" onClick={close} aria-label="Kapat"><Icon name="x" /></button>
        </div>

        <div className="drawer-b">
          <div className="stats">
            <div className="stat"><b>{money(a.spent)}</b><span>Harcama{a.budget ? ` / $${a.budget}` : ''}</span></div>
            <div className="stat"><b>{kfmt(a.tokens)}</b><span>Token</span></div>
            <div className="stat"><b>{reports.length}</b><span>Ekip üyesi</span></div>
          </div>

          {act && (
            <div className="col" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 13 }}>{act.text}</span>
              <Bar value={act.progress} />
            </div>
          )}

          <label className="field">
              <span>İsim</span>
              <input className="input" value={name.value} onChange={(e) => name.onChange(e.target.value)} onBlur={name.onBlur} />
            </label>

          <label className="field">
            <span>Rol</span>
            <input className="input" value={role.value} onChange={(e) => role.onChange(e.target.value)} onBlur={role.onBlur} placeholder="ör. Fiyat analisti" />
          </label>

          <div className="grid2">
            <label className="field">
              <span>Uzmanlık</span>
              <select className="input" value={a.kind} onChange={(e) => update({ kind: e.target.value as AgentKind })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Model</span>
              <select className="input" value={a.model} onChange={(e) => update({ model: e.target.value as ModelId })}>
                {Object.keys(MODELS).map((k) => <option key={k} value={k}>{modelLabel(k as ModelId, settings)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Takım</span>
              <select
                className="input"
                value={a.teamId ?? ''}
                onChange={(e) => {
                  const team = s.teams.find((t) => t.id === e.target.value);
                  update({ teamId: team?.id ?? null, ...(team ? { color: team.color } : {}) });
                }}
              >
                <option value="">— Takımsız —</option>
                {s.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Yöneticisi</span>
              <select className="input" value={a.managerId ?? ''} onChange={(e) => update({ managerId: e.target.value || null })}>
                <option value="">— Kimse (en üst) —</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>

          <EffortPicker agent={a} />

          <div className="field">
            <span>Yetki</span>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              {(Object.keys(AUTONOMY) as Autonomy[]).map((k) => (
                <button key={k} className={a.autonomy === k ? 'on' : ''} onClick={() => update({ autonomy: k })}>{AUTONOMY[k].label}</button>
              ))}
            </div>
            <small className="dim">{AUTONOMY[a.autonomy].hint}</small>
          </div>

          <label className="field">
            <span>Harcama limiti ($, 0 = limitsiz)</span>
            <input className="input" inputMode="decimal" value={budget.value} onChange={(e) => budget.onChange(e.target.value)} onBlur={budget.onBlur} />
          </label>

          <div className="field">
            <span>Araçlar</span>
            <div className="chips">
              {Object.entries(TOOLS).map(([k, label]) => {
                const on = a.tools.includes(k);
                return (
                  <button key={k} className={`chip ${on ? 'on' : ''}`}
                    onClick={() => update({ tools: on ? a.tools.filter((t) => t !== k) : [...a.tools, k] })}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>Talimat (system prompt)</span>
            <textarea className="input" rows={4} value={prompt.value} onChange={(e) => prompt.onChange(e.target.value)} onBlur={prompt.onBlur}
              placeholder="Bu ajan nasıl davranmalı?" />
          </label>

          <div className="field">
            <span>Yönettiği ajanlar</span>
            <div className="col" style={{ gap: 6 }}>
              {reports.map((r) => (
                <button key={r.id} className="template" onClick={() => selectAgent(r.id)}>
                  <Avatar agent={r} size="sm" />
                  <span className="grow">{r.name} <span className="muted">· {r.role}</span></span>
                  <span className="dim">→</span>
                </button>
              ))}
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => createAgent({ teamId: a.teamId, managerId: a.id })}>
                + Alt ajan ekle
              </button>
            </div>
          </div>

          <div className="field">
            <span>Son aktivite</span>
            <div className="card"><Feed logs={logs} /></div>
          </div>
        </div>

        <div className="drawer-f">
          <button className="btn primary grow" onClick={() => openModal({ kind: 'mission', ownerId: a.id })}>Görev ver</button>
          <button className="btn" onClick={() => update({ paused: !a.paused })}>{a.paused ? <><Icon name="play" size={13} /> Devam</> : <><Icon name="pause" size={13} /> Duraklat</>}</button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(`${a.name} silinsin mi? Ekibi bir üst yöneticiye bağlanır.`)) {
                dispatch({ type: 'agent/delete', id: a.id });
                close();
              }
            }}
          >
            Sil
          </button>
        </div>
      </aside>
    </>
  );
}
