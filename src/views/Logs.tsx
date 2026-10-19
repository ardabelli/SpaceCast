import { useState } from 'react';
import { Icon } from '../icons.tsx';
import type { LogEntry, LogType } from '../../shared/types.ts';
import { useAppState, useStore } from '../store.ts';
import { Empty, clock } from '../ui.tsx';

const TYPE_LABEL: Partial<Record<LogType, string>> = {
  delegate: 'Görev dağıtımı',
  tool: 'Araç kullanımı',
  result: 'Sonuçlar',
  approval: 'Onaylar',
  error: 'Hatalar',
};

export function Feed({ logs }: { logs: LogEntry[] }) {
  if (!logs.length) return <Empty icon={<Icon name="inbox" size={28} />}>Henüz kayıt yok</Empty>;
  return (
    <div className="feed">
      {logs.map((l) => (
        <div key={l.id} className="feed-item">
          <span className="t">{clock(l.ts)}</span>
          <span className={`lt-${l.type}`}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Logs() {
  const s = useAppState();
  const dispatch = useStore((x) => x.dispatch);
  const [agent, setAgent] = useState('');
  const [type, setType] = useState<LogType | ''>('');

  const logs = s.logs
    .filter((l) => !agent || l.agentId === agent || l.toAgentId === agent)
    .filter((l) => !type || l.type === type)
    .slice()
    .reverse();

  return (
    <div className="card">
      <div className="card-h wrap">
        <select className="input" style={{ width: 'auto' }} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">Tüm ajanlar</option>
          {s.agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as LogType | '')}>
          <option value="">Tüm türler</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="grow" />
        <span className="dim">{logs.length} kayıt</span>
        <button className="btn sm ghost" onClick={() => confirm('Tüm kayıtlar silinsin mi?') && dispatch({ type: 'logs/clear' })}>
          Temizle
        </button>
      </div>
      <Feed logs={logs} />
    </div>
  );
}
