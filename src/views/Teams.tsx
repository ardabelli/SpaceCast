import { agentStatus } from '../../shared/engine.ts';
import { Icon, TeamIcon } from '../icons.tsx';
import type { Agent } from '../../shared/types.ts';
import { createAgent } from '../actions.ts';
import { useAppState, useStore } from '../store.ts';
import { Avatar, Empty, StatusBadge, money } from '../ui.tsx';

export function Teams() {
  const s = useAppState();
  const { openModal, selectAgent } = useStore.getState();
  const loners = s.agents.filter((a) => !a.teamId);

  const Member = ({ a }: { a: Agent }) => {
    const manager = s.agents.find((m) => m.id === a.managerId);
    return (
      <div className="agent-row" onClick={() => selectAgent(a.id)}>
        <Avatar agent={a} status={agentStatus(s, a.id)} />
        <div className="grow">
          <div className="row"><b>{a.name}</b><span className="muted" style={{ fontSize: 12.5 }}>{a.role}</span></div>
          <div className="dim" style={{ fontSize: 12 }}>{manager ? `↑ ${manager.name}'a bağlı` : 'En üst kademe'}</div>
        </div>
        <span className="hide-m"><StatusBadge s={s} id={a.id} /></span>
        <span className="mono dim hide-m">{money(a.spent)}</span>
      </div>
    );
  };

  return (
    <div className="col" style={{ gap: 20, maxWidth: 980 }}>
      <div className="row wrap">
        <p className="muted grow" style={{ margin: 0 }}>
          Takımlar ajanları amaca göre gruplar. Kimin kimi yöneteceğini haritada ajanları birbirine bağlayarak veya ajan panelinden seçersin.
        </p>
        <button className="btn" onClick={() => createAgent()}>+ Ajan</button>
        <button className="btn primary" onClick={() => openModal({ kind: 'team' })}>+ Takım kur</button>
      </div>

      {s.teams.map((t) => {
        const members = s.agents.filter((a) => a.teamId === t.id);
        const lead = members.find((a) => !members.some((m) => m.id === a.managerId));
        return (
          <div key={t.id} className="card" style={{ borderTop: `3px solid ${t.color}` }}>
            <div className="card-h wrap">
              <span className="team-ico" style={{ color: t.color }}><TeamIcon icon={t.icon} size={20} /></span>
              <div className="grow">
                <h3>{t.name}</h3>
                <div className="muted" style={{ fontSize: 12.5 }}>{t.goal || 'Amaç belirtilmedi'}</div>
              </div>
              <button className="btn sm ghost" onClick={() => openModal({ kind: 'team', teamId: t.id })}>Düzenle</button>
              <button className="btn sm" onClick={() => createAgent({ teamId: t.id, managerId: lead?.id })}>+ Üye</button>
              <button className="btn sm primary" disabled={!lead} onClick={() => lead && openModal({ kind: 'mission', ownerId: lead.id })}>Görev ver</button>
            </div>
            {members.length ? (
              <div className="agent-list">{members.map((a) => <Member key={a.id} a={a} />)}</div>
            ) : (
              <Empty icon={<Icon name="users" size={28} />}>Bu takımda henüz kimse yok</Empty>
            )}
          </div>
        );
      })}

      {loners.length > 0 && (
        <div className="card">
          <div className="card-h">
            <span style={{ fontSize: 20 }}>🎖️</span>
            <div className="grow">
              <h3>Komuta & bağımsızlar</h3>
              <div className="muted" style={{ fontSize: 12.5 }}>Bir takıma ait olmayan ajanlar (ör. birden fazla takımı yöneten komutan)</div>
            </div>
          </div>
          <div className="agent-list">{loners.map((a) => <Member key={a.id} a={a} />)}</div>
        </div>
      )}
    </div>
  );
}
