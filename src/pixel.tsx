// Piksel sanat karakterleri: tek bir 1×1 öğe + box-shadow ile çizilir, ajan kimliğinden türetilen saç/renk varyasyonlarıyla.

import { memo } from 'react';

const HAIR_COLORS = ['#2a1a10', '#6b3e1e', '#d9a441', '#1d1d2b', '#a33b2b', '#e8e8e8'];
const SKINS = ['#f2c79b', '#d9a066', '#a8714a', '#f5d6b8'];

const HAIRSTYLES = [
  ['..HHHH..', '.HHHHHH.', '.HSSSSH.'],
  ['.HHHHHH.', 'HHHHHHHH', 'HSSSSSSH'],
  ['...HH...', '.HHHHHH.', '.SSSSSS.'],
  ['..HHHH..', '.HHHHHH.', 'HHSSSSHH'],
];

const BODY = [
  '..SSSS..',
  '..SEES..',
  '...SS...',
  '.BBBBBB.',
  'BBBBBBBB',
  'S.BBBB.S',
  '..BBBB..',
  '..L..L..',
  '..L..L..',
];

function hash(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const cache = new Map<string, string>();

function shadows(seed: string, body: string, px: number) {
  const key = `${seed}|${body}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hash(seed);
  const rows = [...HAIRSTYLES[h % HAIRSTYLES.length], ...BODY];
  const col: Record<string, string> = {
    H: HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length],
    S: SKINS[(h >>> 6) % SKINS.length],
    E: '#111',
    B: body,
    L: '#1b1f2a',
  };
  const out: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.') out.push(`${x * px}px ${y * px}px 0 ${col[ch]}`);
    }),
  );
  const v = out.join(',');
  cache.set(key, v);
  return v;
}

export const SPRITE_W = 8;
export const SPRITE_H = 12;

export const Sprite = memo(function Sprite({ seed, color, px = 3, glow }: { seed: string; color: string; px?: number; glow?: boolean }) {
  return (
    <span
      className="sprite"
      style={{
        width: SPRITE_W * px,
        height: SPRITE_H * px,
        filter: glow ? `drop-shadow(0 0 ${px * 2}px ${color})` : undefined,
      }}
    >
      <i style={{ width: px, height: px, boxShadow: shadows(seed, color, px) }} />
    </span>
  );
});
