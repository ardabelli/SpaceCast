import { TOOLS } from '../../shared/meta.ts';
import { Icon } from '../icons.tsx';
import { useAppState, useStore } from '../store.ts';
import { Avatar, Empty, ago } from '../ui.tsx';

export function Approvals() {
  const s = useAppState();
  const dispatch = useStore((x) => x.dispatch);
  const pending = s.approvals.filter((a) => a.status === 'pending').slice().reverse();
  const history = s.approvals.filter((a) => a.status !== 'pending').slice(-30).reverse();

  const resolve = (id: string, approved: boolean) => dispatch({ type: 'approval/resolve', id, approved });

  return (
    <div className="col" style={{ gap: 20, maxWidth: 860 }}>
      <p className="muted" style={{ margin: 0 }}>
        "Onay ister" modundaki ajanlar para harcamak, yayına almak veya dışarıya mesaj göndermek gibi geri alınması zor işlemlerden önce
        burada senin kararını bekler.
      </p>
      <div className="card">
        <div className="card-h">
          <h3>Bekleyen</h3>
          {pending.length > 0 && <span className="badge count">{pending.length}</span>}
          <span className="grow" />
          {pending.length > 1 && (
            <button className="btn sm danger" onClick={() => pending.forEach((p) => resolve(p.id, false))}>Tümünü reddet</button>
          )}
        </div>
        {pending.length === 0 && <Empty icon={<Icon name="check" size={28} />}>Onay bekleyen işlem yok</Empty>}
        {pending.map((p) => {
          const a = s.agents.find((x) => x.id === p.agentId);
          const m = s.missions.find((x) => x.id === p.missionId);
          return (
            <div key={p.id} className="approval">
              {a && <Avatar agent={a} size="lg" />}
              <div className="grow col" style={{ gap: 3 }}>
                <div className="row wrap">
                  <b>{a?.name ?? 'Silinmiş ajan'}</b>
                  {p.tool && <span className="badge">{TOOLS[p.tool] ?? p.tool}</span>}
                  <span className="dim" style={{ fontSize: 12 }}>{ago(p.ts)}</span>
                </div>
                <div>{p.action}</div>
                {m && <div className="muted" style={{ fontSize: 12.5 }}>Görev: {m.title}</div>}
              </div>
              {p.amount !== undefined && <div className="amount">${p.amount}</div>}
              <div className="row">
                <button className="btn danger" onClick={() => resolve(p.id, false)}>Reddet</button>
                <button className="btn ok" onClick={() => resolve(p.id, true)}>Onayla</button>
              </div>
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <div className="card">
          <div className="card-h"><h3>Geçmiş</h3></div>
          <div className="feed">
            {history.map((p) => {
              const a = s.agents.find((x) => x.id === p.agentId);
              return (
                <div key={p.id} className="feed-item" style={{ alignItems: 'center' }}>
                  <span className={`badge ${p.status === 'approved' ? 'ok' : 'bad'}`}>{p.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}</span>
                  <span className="grow ellipsis"><b>{a?.name}</b> <span className="muted">{p.action}</span></span>
                  {p.amount !== undefined && <span className="mono">${p.amount}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
