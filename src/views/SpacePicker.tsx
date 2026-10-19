// Arka plan uzay teması seçimi: her tema küçük bir önizlemeyle gösterilir, seçim bu cihazda saklanır.

import { SPACE_THEMES } from '../spaceThemes.ts';
import { useStore } from '../store.ts';

export function SpacePicker() {
  const value = useStore((x) => x.spaceTheme);
  const set = useStore((x) => x.setSpaceTheme);
  return (
    <div className="space-grid" role="radiogroup" aria-label="Arka plan">
      {SPACE_THEMES.map((t) => (
        <button key={t.id} role="radio" aria-checked={value === t.id} className={`space-opt ${value === t.id ? 'on' : ''}`} onClick={() => set(t.id)}>
          <span className="space-swatch" style={{ background: `${t.nebula}, ${t.base}` }}>
            <i style={{ background: `linear-gradient(135deg, ${t.planet[1]}, ${t.planet[0]})`, boxShadow: `0 0 12px ${t.glow}` }} />
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
