import { taskProgress } from '../../shared/engine.ts';
import { Icon } from '../icons.tsx';
import type { AppState, Mission, Task, TaskStatus } from '../../shared/types.ts';
import { useAppState, useStore } from '../store.ts';
import { Avatar, Bar, Empty, ago } from '../ui.tsx';
import { Feed } from './Logs.tsx';

const MISSION_BADGE: Record<Mission['status'], [string, string]> = {
  running: ['info', 'Sürüyor'],
  paused: ['warn', 'Duraklatıldı'],
  done: ['ok', 'Tamamlandı'],
  cancelled: ['bad', 'İptal'],
};

const TASK_LABEL: Record<TaskStatus, [string, string]> = {
  pending: ['', 'Sırada'],
  planning: ['info', 'Planlıyor'],
  running: ['info', 'Çalışıyor'],
  waiting_children: ['accent', 'Ekibini bekliyor'],
  waiting_approval: ['warn', 'Onay bekliyor'],
  done: ['ok', 'Bitti'],
  skipped: ['', 'Atlandı'],
};

function rootOf(s: AppState, m: Mission) {
  return s.tasks.find((t) => t.missionId === m.id && t.parentId === null);
}

export function Missions() {
  const s = useAppState();
  const { selectedMissionId, selectMission, openModal } = useStore();
  const list = s.missions.slice().reverse();
  const m = list.find((x) => x.id === selectedMissionId) ?? list[0];

  if (!list.length) {
    return (
      <div className="card">
        <Empty icon={<Icon name="target" size={28} />}>
          <p>Henüz görev yok. Bir göreve isim ver, kime vereceğini seç; ajanlar işi kendi aralarında bölüşsün.</p>
          <button className="btn primary" onClick={() => openModal({ kind: 'mission' })}>+ İlk görevi ver</button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="missions">
      <div className="card">
        {list.map((x) => {
          const root = rootOf(s, x);
          const [cls, label] = MISSION_BADGE[x.status];
          return (
            <div key={x.id} className={`mission-item ${x.id === m?.id ? 'on' : ''}`} onClick={() => selectMission(x.id)}>
              <div className="row">
                <b className="grow ellipsis">{x.title}</b>
                <span className={`badge ${cls}`}>{label}</span>
              </div>
              <Bar value={root ? taskProgress(s, root) : 0} ok={x.status === 'done'} />
              <span className="dim" style={{ fontSize: 12 }}>{ago(x.createdAt)}</span>
            </div>
          );
        })}
      </div>
      {m && <MissionDetail m={m} />}
    </div>
  );
}

function MissionDetail({ m }: { m: Mission }) {
  const s = useAppState();
  const dispatch = useStore((x) => x.dispatch);
  const root = rootOf(s, m);
  const owner = s.agents.find((a) => a.id === m.ownerId);
  const [cls, label] = MISSION_BADGE[m.status];
  const live = m.status === 'running' || m.status === 'paused';

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-b col" style={{ gap: 12 }}>
          <div className="row wrap">
            <h2 style={{ fontSize: 18 }} className="grow">{m.title}</h2>
            <span className={`badge ${cls}`}>{label}</span>
          </div>
          {m.description && <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.description}</p>}
          <div className="row wrap">
            <span className={`badge ${m.real ? 'ok' : ''}`}>{m.real ? 'Gerçek · Claude' : 'Simülasyon'}</span>
            {m.workspace && <span className="mono dim" style={{ wordBreak: 'break-all' }}><Icon name="folder" size={13} /> {m.workspace}</span>}
          </div>
          <div className="row wrap">
            {owner && (
              <span className="row muted" style={{ fontSize: 13 }}>
                <Avatar agent={owner} size="sm" /> {owner.name} yönetiyor
              </span>
            )}
            <span className="grow" />
            {m.status === 'running' && <button className="btn sm" onClick={() => dispatch({ type: 'mission/setStatus', id: m.id, status: 'paused' })}><Icon name="pause" size={13} /> Duraklat</button>}
            {m.status === 'paused' && <button className="btn sm" onClick={() => dispatch({ type: 'mission/setStatus', id: m.id, status: 'running' })}><Icon name="play" size={13} /> Devam et</button>}
            {live && <button className="btn sm danger" onClick={() => dispatch({ type: 'mission/setStatus', id: m.id, status: 'cancelled' })}>İptal et</button>}
            {!live && <button className="btn sm ghost" onClick={() => dispatch({ type: 'mission/delete', id: m.id })}>Sil</button>}
          </div>
          {root && <Bar value={taskProgress(s, root)} ok={m.status === 'done'} />}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Komuta zinciri</h3></div>
        <div className="tree">{root ? <TaskNode t={root} depth={0} /> : <Empty icon="…">Görev planlanıyor</Empty>}</div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Görev kayıtları</h3></div>
        <Feed logs={s.logs.filter((l) => l.missionId === m.id).slice(-40).reverse()} />
      </div>
    </div>
  );
}

function TaskNode({ t, depth }: { t: Task; depth: number }) {
  const s = useAppState();
  const selectAgent = useStore((x) => x.selectAgent);
  const a = s.agents.find((x) => x.id === t.assigneeId);
  const kids = s.tasks.filter((k) => k.parentId === t.id);
  const [cls, label] = TASK_LABEL[t.status];
  const step = t.status === 'running' || t.status === 'waiting_approval' ? t.steps[t.stepIndex]?.text : t.result;
  return (
    <>
      <div className="tnode">
        <span className="indent" style={{ width: depth * 22 }} />
        {a ? <span onClick={() => selectAgent(a.id)} style={{ cursor: 'pointer' }}><Avatar agent={a} size="sm" /></span> : <span className="avatar sm">?</span>}
        <div className="grow">
          <div className="row">
            <b style={{ fontSize: 13 }}>{a?.name ?? 'Silinmiş'}</b>
            <span className="muted ellipsis" style={{ fontSize: 12.5 }}>{t.title}</span>
          </div>
          {step && <div className="dim" style={{ fontSize: 12, whiteSpace: t.status === 'done' ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: t.status === 'done' ? 120 : undefined }}>{step}</div>}
          <div style={{ marginTop: 4, maxWidth: 260 }}><Bar value={taskProgress(s, t)} ok={t.status === 'done'} /></div>
        </div>
        <span className={`badge ${cls}`}>{label}</span>
      </div>
      {kids.map((k) => (
        <TaskNode key={k.id} t={k} depth={depth + 1} />
      ))}
    </>
  );
}
