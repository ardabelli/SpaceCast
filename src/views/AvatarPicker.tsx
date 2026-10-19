// Dijital ikizin karakter seçimi: piksel karakterler ızgarası, seçilen hemen ikize uygulanır.

import { TWIN_AVATARS } from '../../shared/meta.ts';
import { TWIN_ID } from '../../shared/seed.ts';
import { Npc } from '../npc.tsx';
import { twinSprite } from '../pixelart.ts';
import { useStore } from '../store.ts';

export function AvatarPicker() {
  const twin = useStore((x) => x.state?.agents.find((a) => a.id === TWIN_ID));
  const dispatch = useStore((x) => x.dispatch);
  if (!twin) return null;
  const value = twin.avatar ?? 'knight';
  return (
    <div className="avatar-grid" role="radiogroup" aria-label="İkizin karakteri">
      {TWIN_AVATARS.map((c) => (
        <button key={c.id} role="radio" aria-checked={value === c.id} className={`avatar-opt ${value === c.id ? 'on' : ''}`} title={c.label}
          onClick={() => dispatch({ type: 'agent/update', id: twin.id, patch: { avatar: c.id } })}>
          <Npc sheet={twinSprite(c.id)} scale={3} moving={value === c.id} />
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}
