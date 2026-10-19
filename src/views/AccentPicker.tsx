// Vurgu rengi seçimi: arayüz detayları ve ikizin reaktör ışıkları bu renge bürünür. Seçim bu cihazda saklanır.

import { ACCENTS } from '../accents.ts';
import { useStore } from '../store.ts';

export function AccentPicker() {
  const value = useStore((x) => x.accent);
  const set = useStore((x) => x.setAccent);
  return (
    <div className="accent-row" role="radiogroup" aria-label="Vurgu rengi">
      {ACCENTS.map((a) => (
        <button key={a.id} role="radio" aria-checked={value === a.id} className={`accent-opt ${value === a.id ? 'on' : ''}`} title={a.label} onClick={() => set(a.id)}>
          <i style={{ background: `radial-gradient(circle at 40% 35%, ${a.pale}, ${a.hi} 30%, ${a.hex} 60%, rgb(${a.deep}) 100%)`, boxShadow: `0 0 12px ${a.hex}66` }} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
