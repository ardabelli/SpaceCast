// Bir odanın (ekibin) üretim terminali: gelir, ekip, adım adım iş hattı, BEKLET / HIZLANDIR.

import { agentStatus, currentActivity, taskProgress } from '../../shared/engine.ts';
import { Icon, TeamIcon } from '../icons.tsx';
import type { Team } from '../../shared/types.ts';
import { Sprite } from '../pixel.tsx';
import { useAppState, useStore, useTwinName } from '../store.ts';
import { Bar, STATUS_LABEL, money } from '../ui.tsx';
import { Feed } from './Logs.tsx';

export function Terminal({ team, index, onClose }: { team: Team; index: number; onClose: () => void }) {
  const s = useAppState();
  const twinName = useTwinName();
  const { dispatch, selectAgent, openModal } = useStore.getState();
  const members = s.agents.filter((a) => a.teamId === team.id);
  const ids = new Set(members.map((m) => m.id));
  const lead = members.find((a) => !ids.has(a.managerId ?? ''));
  const live = new Set(s.missions.filter((m) => m.status === 'running' || m.status === 'paused').map((m) => m.id));
  const tasks = s.tasks.filter((t) => live.has(t.missionId) && ids.has(t.assigneeId) && t.status !== 'skipped');
  const leaf = tasks.filter((t) => !s.tasks.some((c) => c.parentId === t.id));
  const spent = members.reduce((n, a) => n + a.spent, 0);
  const allPaused = members.length > 0 && members.every((a) => a.paused);
  const doneMissions = new Set(s.tasks.filter((t) => ids.has(t.assigneeId) && t.status === 'done').map((t) => t.missionId)).size;
  const confidence = Math.min(99, 72 + doneMissions * 4 + (team.boost ? 3 : 0));
  const activeMission = s.missions.find((m) => tasks.some((t) => t.missionId === m.id));
  const logs = s.logs.filter((l) => (l.agentId && ids.has(l.agentId)) || (l.toAgentId && ids.has(l.toAgentId))).slice(-14).reverse();

  return (
    <div className="terminal" style={{ ['--tc' as string]: team.color }}>
      <div className="term-top">
        <button className="btn sm" onClick={onClose}><Icon name="back" size={15} /> Üsse dön</button>
        <span className="dim">Oda {index + 1} · {team.goal}</span>
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => openModal({ kind: 'team', teamId: team.id })}>Düzenle</button>
      </div>
      <h2 className="term-title"><TeamIcon icon={team.icon} size={26} /> {team.name}</h2>

      <div className="term-tiles">
        <div className="tile"><span>Harcama</span><b>{money(spent)}</b></div>
        <div className="tile"><span>Ekip</span><b>{members.length} ajan</b></div>
        <div className="tile"><span>Güven</span><b>%{confidence}</b></div>
      </div>

      <div className="term-actions">
        <button className={`btn ${allPaused ? 'primary' : ''}`} onClick={() => dispatch({ type: 'team/pause', id: team.id, paused: !allPaused })}>
          {allPaused ? <><Icon name="play" size={13} /> Devam</> : <><Icon name="pause" size={13} /> Beklet</>}
        </button>
        <button className={`btn ${team.boost ? 'warn-solid' : ''}`} onClick={() => dispatch({ type: 'team/update', id: team.id, patch: { boost: !team.boost } })}>
          <Icon name="zap" size={14} /> {team.boost ? 'Hızlandırıldı' : 'Hızlandır'}
        </button>
        <span className="grow" />
        <button className="btn primary" disabled={!lead} onClick={() => lead && openModal({ kind: 'mission', ownerId: lead.id })}>+ Görev ver</button>
      </div>

      <div className="term-grid">
        <section className="panel">
          <div className="panel-h">İş hattı {activeMission && <span className="dim">· {activeMission.title}</span>}</div>
          {leaf.length === 0 && <div className="empty">Hat boşta. {twinName} ile konuşup bir iş söyle ya da buradan görev ver.</div>}
          {leaf.map((t, i) => {
            const a = s.agents.find((x) => x.id === t.assigneeId)!;
            const step = t.status === 'done' ? t.result : t.steps[t.stepIndex]?.text ?? (t.status === 'waiting_approval' ? 'Onay bekliyor' : 'Planlanıyor');
            return (
              <div key={t.id} className={`pipe-step ${t.status}`}>
                <span className="no">{String(i + 1).padStart(2, '0')}</span>
                <div className="grow">
                  <div className="row">
                    <b>{a.name}</b>
                    <span className="dim ellipsis">{a.role}</span>
                    <span className="grow" />
                    <span className={`chip-st ${t.status}`}>
                      {t.status === 'done' ? 'Tamam' : t.status === 'waiting_approval' ? 'Onay' : 'Çalışıyor'}
                    </span>
                  </div>
                  <div className="muted ellipsis" style={{ fontSize: 12 }}>{step}</div>
                  <Bar value={taskProgress(s, t)} ok={t.status === 'done'} />
                </div>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <div className="panel-h">Mürettebat</div>
          {members.map((a) => {
            const st = agentStatus(s, a.id);
            const act = currentActivity(s, a.id);
            return (
              <div key={a.id} className="crew" onClick={() => selectAgent(a.id)}>
                <span className="crew-av"><Sprite seed={a.id} color={a.color} px={3} /></span>
                <div className="grow">
                  <div className="row"><b>{a.name}</b><span className="dim">{a.role}</span></div>
                  <div className="muted ellipsis" style={{ fontSize: 12 }}>{act?.text ?? STATUS_LABEL[st]}</div>
                </div>
                <span className={`status-dot st-${st}`} />
              </div>
            );
          })}
          <div className="panel-h" style={{ marginTop: 8 }}>Oda kayıtları</div>
          <Feed logs={logs} />
        </section>
      </div>
    </div>
  );
}
