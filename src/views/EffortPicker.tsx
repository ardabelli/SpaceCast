// Ajanın düşünme seviyesi: "Önerilen" rolüne göre seçilir, istenirse elle düşük/orta/yüksek yapılır.

import { EFFORTS, RECOMMENDED_EFFORT } from '../../shared/meta.ts';
import { PROVIDERS } from '../../shared/providers.ts';
import type { Agent, Effort } from '../../shared/types.ts';
import { useStore } from '../store.ts';

const LEVELS = ['low', 'medium', 'high'] as const;

export function EffortPicker({ agent, compact }: { agent: Agent; compact?: boolean }) {
  const dispatch = useStore((x) => x.dispatch);
  const settings = useStore((x) => x.settings);
  const value: Effort = agent.effort ?? 'auto';
  const rec = RECOMMENDED_EFFORT[agent.kind];
  const set = (effort: Effort) => dispatch({ type: 'agent/update', id: agent.id, patch: { effort } });

  if (compact) {
    return (
      <select className="effort-sel" value={value} title="Düşünme seviyesi" onChange={(e) => set(e.target.value as Effort)}>
        <option value="auto">Düşünme: önerilen ({EFFORTS[rec].label.toLowerCase()})</option>
        {LEVELS.map((l) => <option key={l} value={l}>Düşünme: {EFFORTS[l].label.toLowerCase()}</option>)}
      </select>
    );
  }

  const effective = value === 'auto' ? rec : value;
  const claude = !settings || PROVIDERS[settings.provider.id].engine === 'claude';
  return (
    <div className="field">
      <span>Düşünme seviyesi</span>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <button className={value === 'auto' ? 'on' : ''} onClick={() => set('auto')}>Önerilen · {EFFORTS[rec].label}</button>
        {LEVELS.map((l) => (
          <button key={l} className={value === l ? 'on' : ''} onClick={() => set(l)}>{EFFORTS[l].label}</button>
        ))}
      </div>
      <small className="dim">
        {EFFORTS[effective].hint}.{value === 'auto' && agent.kind !== 'twin' && rec !== 'low' ? ' Planlama ve özetlerde düşük kullanılır.' : ''}
        {value === 'auto' && agent.kind === 'twin' ? ' Görsel ya da dosya gönderince orta kullanılır.' : ''}
        {!claude ? ' Bu sağlayıcıda yalnızca düşünme destekleyen modellerde etkilidir.' : ''}
      </small>
    </div>
  );
}
