// Oyun tarzı piksel çizimler (canvas → data URL, önbellekli):
//  - NPC'ler: rol + oda temasına göre kıyafet, 2 yürüme karesi, koyu dış çizgi (Terraria esintili)
//  - İkiz: nükleer şövalye
//  - İstasyon eşyaları (masa, monitör, tezgâh, sunucu dolabı…) ve oda dekor şeritleri

import type { AgentKind, TeamTheme } from '../shared/types.ts';

const cache = new Map<string, Sheet>();
export interface Sheet { url: string; w: number; h: number; frames: number }

const OUTLINE = '#0a0b12';

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return '#' + ch.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Izgarayı (harf → renk) boyar; çevresine 1 piksel dış çizgi ekler. Birden fazla kare yan yana dizilir. */
function render(frames: string[][], pal: Record<string, string>, outline = true): Sheet {
  const gw = frames[0][0].length, gh = frames[0].length;
  const fw = gw + 2, fh = gh + 2;
  const c = document.createElement('canvas');
  c.width = fw * frames.length;
  c.height = fh;
  const ctx = c.getContext('2d')!;
  frames.forEach((grid, f) => {
    const ox = f * fw + 1, oy = 1;
    const solid = (x: number, y: number) => y >= 0 && y < gh && x >= 0 && x < gw && grid[y][x] !== '.' && pal[grid[y][x]] !== undefined;
    if (outline) {
      ctx.fillStyle = OUTLINE;
      for (let y = -1; y <= gh; y++) {
        for (let x = -1; x <= gw; x++) {
          if (solid(x, y)) continue;
          if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const col = pal[grid[y][x]];
        if (grid[y][x] === '.' || !col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  });
  return { url: c.toDataURL(), w: fw, h: fh, frames: frames.length };
}

// ------------------------------------------------------------------ NPC

const SKINS = ['#f1c9a5', '#d9a37a', '#a8714f', '#f6dcc3', '#7a4b32'];
const HAIRS = ['#2b1d16', '#5a3620', '#c9953f', '#1c1c28', '#8c2f2a', '#d9d9e0', '#3d4a8a'];

const BASE = [
  '............',
  '....HHHH....',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HSSSSSSH..',
  '..SSESSESS..',
  '..SSSSSSSS..',
  '...SSSSSS...',
  '.....SS.....',
  '..OOOOOOOO..',
  '.OOOOOOOOOO.',
  '.SOOOOOOOOS.',
  '.SOOLLLLOOS.',
  '..PPPPPPPP..',
  '..PPP..PPP..',
  '..PPP..PPP..',
  '..FFF..FFF..',
  '............',
];
const STRIDE: Record<number, string> = { 14: '..PPP..PPP..', 15: '.PPP....PPP.', 16: '.FFF....FFF.' };

type Outfit = 'labcoat' | 'hoodie' | 'vest' | 'jumpsuit' | 'suit' | 'shirt' | 'commander' | 'uniform';
type Acc = 'goggles' | 'glasses' | 'shades' | 'headphones' | 'helmet' | 'earpiece' | 'badge' | 'headset';

export function look(kind: AgentKind, theme: TeamTheme, lead: boolean): { outfit: Outfit; acc: Acc[] } {
  if (theme === 'lab') {
    if (lead) return { outfit: 'labcoat', acc: ['badge', 'glasses'] };
    if (kind === 'research') return { outfit: 'labcoat', acc: ['goggles'] };
    if (kind === 'writer' || kind === 'analyst') return { outfit: 'labcoat', acc: ['glasses'] };
    return { outfit: 'labcoat', acc: [] };
  }
  if (theme === 'dev') {
    if (lead) return { outfit: 'commander', acc: ['headset'] };
    if (kind === 'qa') return { outfit: 'vest', acc: ['goggles'] };
    if (kind === 'devops') return { outfit: 'jumpsuit', acc: ['helmet'] };
    return { outfit: 'hoodie', acc: ['headphones'] };
  }
  if (theme === 'trade') {
    if (lead) return { outfit: 'commander', acc: ['earpiece'] };
    if (kind === 'trader') return { outfit: 'suit', acc: ['shades'] };
    if (kind === 'analyst') return { outfit: 'shirt', acc: ['glasses'] };
    return { outfit: 'suit', acc: ['earpiece'] };
  }
  return { outfit: lead ? 'commander' : 'uniform', acc: lead ? ['headset'] : [] };
}

const HAIR_STYLES: ((g: string[][]) => void)[] = [
  () => {},
  (g) => { row(g, 0, '...H.H.H....'); row(g, 1, '...HHHHHH...'); row(g, 2, '..HHHHHHHH..'); },
  (g) => { row(g, 5, '.HSSESSESSH.'); row(g, 6, '.HSSSSSSSSH.'); row(g, 7, '.HHSSSSSSHH.'); row(g, 8, '.HH..SS..HH.'); },
  (g) => { row(g, 1, '............'); row(g, 2, '...HHHHHH...'); },
  (g) => { row(g, 0, '.....HH.....'); },
  (g) => { row(g, 3, '..HHHHHHHHH.'); row(g, 4, '..HSSSSSHHH.'); },
];

function row(g: string[][], y: number, s: string) { g[y] = s.split(''); }
function set(g: string[][], y: number, x: number, ch: string) { g[y][x] = ch; }

function npcGrid(o: Outfit, acc: Acc[], hair: number, frame: number) {
  const g = BASE.map((r) => r.split(''));
  if (frame === 1) for (const [y, s] of Object.entries(STRIDE)) row(g, Number(y), s);
  HAIR_STYLES[hair](g);
  switch (o) {
    case 'labcoat':
      row(g, 9, '..WWWCCWWW..'); row(g, 10, '.WWWWTTWWWW.'); row(g, 11, '.SWWwTTwWWS.'); row(g, 12, '.SWWWTTWWWS.');
      row(g, 13, '..WWPPPPWW..'); set(g, 14, 2, 'W'); set(g, 14, 9, 'W');
      break;
    case 'hoodie':
      row(g, 3, '..OHHHHHHO..'); row(g, 4, '.OHSSSSSSHO.'); row(g, 5, '.OSSESSESSO.'); row(g, 6, '.OSSSSSSSSO.'); row(g, 7, '..OSSSSSSO..'); row(g, 8, '...OOSSOO...');
      row(g, 12, '.SOooooooOS.');
      break;
    case 'vest':
      row(g, 9, '..YYOOOOYY..'); row(g, 10, '.OYYOOOOYYO.'); row(g, 11, '.SYWOOOOWYS.'); row(g, 12, '.SYYLLLLYYS.');
      break;
    case 'jumpsuit':
      row(g, 12, '.SOLLYLLLOS.');
      break;
    case 'suit':
      row(g, 9, '..JJJCCJJJ..'); row(g, 10, '.JJJJTTJJJJ.'); row(g, 11, '.SJJJTTJJJS.'); row(g, 12, '.SJJJTTJJJS.');
      break;
    case 'shirt':
      row(g, 9, '..CCCCCCCC..'); row(g, 10, '.CCCCTTCCCC.'); row(g, 11, '.SCCCTTCCCS.'); row(g, 12, '.SCCLTTLCCS.');
      break;
    case 'commander':
      row(g, 9, '.YAAACCAAAY.'); row(g, 10, '.AAAATTAAAA.'); row(g, 11, '.SAAAYYAAAS.'); row(g, 12, '.SAAAAAAAAS.');
      row(g, 13, '..AAPPPPAA..'); set(g, 14, 2, 'A'); set(g, 14, 9, 'A');
      break;
    case 'uniform':
      row(g, 9, '..OOOCCOOO..');
      break;
  }
  for (const a of acc) {
    if (a === 'goggles') { set(g, 5, 3, 'G'); set(g, 5, 4, 'G'); set(g, 5, 6, 'G'); set(g, 5, 7, 'G'); set(g, 5, 2, 'K'); set(g, 5, 9, 'K'); }
    if (a === 'glasses') { set(g, 5, 3, 'K'); set(g, 5, 5, 'K'); set(g, 5, 6, 'K'); set(g, 5, 8, 'K'); }
    if (a === 'shades') { for (let x = 3; x <= 8; x++) set(g, 5, x, 'K'); }
    if (a === 'headphones') { set(g, 4, 1, 'K'); set(g, 5, 1, 'K'); set(g, 4, 10, 'K'); set(g, 5, 10, 'K'); set(g, 2, 3, 'K'); set(g, 2, 8, 'K'); for (let x = 4; x <= 7; x++) set(g, 1, x, 'K'); }
    if (a === 'helmet') { row(g, 0, '............'); row(g, 1, '....YYYY....'); row(g, 2, '...YYYYYY...'); row(g, 3, '..YYYYYYYY..'); row(g, 4, '..YSSSSSSY..'); }
    if (a === 'earpiece') { set(g, 5, 9, 'K'); set(g, 6, 9, 'G'); }
    if (a === 'badge') { set(g, 10, 3, 'Y'); }
    if (a === 'headset') { set(g, 4, 2, 'K'); set(g, 5, 2, 'K'); set(g, 6, 3, 'K'); }
  }
  return g.map((r) => r.join(''));
}

export function npc(seed: string, kind: AgentKind, theme: TeamTheme, lead: boolean, color: string): Sheet {
  if (kind === 'twin') return knight();
  const key = `npc|${seed}|${kind}|${theme}|${lead}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hash(seed);
  const { outfit, acc } = look(kind, theme, lead);
  const hair = h % HAIR_STYLES.length;
  const pal: Record<string, string> = {
    H: HAIRS[(h >>> 4) % HAIRS.length],
    S: SKINS[(h >>> 8) % SKINS.length],
    E: '#16131c',
    O: color, o: shade(color, -0.3),
    L: '#2b2a35',
    P: '#2a3048',
    F: '#15161f',
    W: '#e9eef7', w: '#b8c2d6',
    C: '#dfe6f2',
    T: color,
    Y: '#f2c14e',
    G: '#7fe3ff',
    K: '#1a1c26',
    J: '#1d2540',
    A: shade(color, -0.55),
  };
  if (outfit === 'hoodie') pal.P = '#2f4470';
  if (outfit === 'jumpsuit') { pal.O = '#e0782f'; pal.o = '#a8521b'; pal.P = '#e0782f'; }
  if (outfit === 'vest') pal.O = '#4a5270';
  if (outfit === 'suit') { pal.P = '#1a2036'; pal.F = '#0d0e14'; }
  if (outfit === 'labcoat') pal.T = shade(color, -0.15);
  const sheet = render([npcGrid(outfit, acc, hair, 0), npcGrid(outfit, acc, hair, 1)], pal);
  cache.set(key, sheet);
  return sheet;
}

/** İkiz: nükleer şövalye (yeşil vizör, göğüste radyasyon işareti, pelerin, enerji kılıcı). */
export function knight(): Sheet {
  const hit = cache.get('knight');
  if (hit) return hit;
  const A = [
    '.....gg.......',
    '....gggg......',
    '....AAAAA...b.',
    '...AAAAAAA..B.',
    '...AaaaaaA..B.',
    '...AGGGGGA..B.',
    '...AaaaaaA..B.',
    '....AaaaA...B.',
    '.PPTAAAAATPPB.',
    'CPPAAYAYAAPPB.',
    'CPAAYYkYYAAPB.',
    'CaAAAYYYAAAaB.',
    'CaAAAAYAAAAHHH',
    'C.ALLLLLLLA.k.',
    'C.AAAAAAAAA.k.',
    'C.AAAA.AAAA...',
    '..aAA...AAa...',
    '..AAA...AAA...',
    '.kkkk...kkkk..',
    '..............',
  ];
  const B = A.slice();
  B[15] = 'C.AAAA.AAAA...';
  B[16] = '.aAA.....AAa..';
  B[17] = '.AAA.....AAA..';
  B[18] = 'kkkk.....kkkk.';
  const sheet = render([A, B], {
    g: '#7dffb2', A: '#b7c2dc', a: '#6c7896', G: '#8dffbe', P: '#4a5578', T: '#5ccf8f',
    Y: '#f2d34e', k: '#1b1e2c', B: '#a8ffd6', b: '#5ce39b', H: '#e0b84a', C: '#1f6b45', L: '#3a3f55',
  });
  cache.set('knight', sheet);
  return sheet;
}

// ------------------------------------------------------------------ istasyon eşyaları

type Ctx = CanvasRenderingContext2D;

function prop(key: string, w: number, h: number, draw: (r: (x: number, y: number, w: number, h: number, c: string) => void, p: (x: number, y: number, c: string) => void) => void, outline = true): Sheet {
  const hit = cache.get(key);
  if (hit) return hit;
  const grid: string[][] = Array.from({ length: h }, () => Array(w).fill('.'));
  const pal: Record<string, string> = {};
  let n = 0;
  const code = (c: string) => {
    const found = Object.entries(pal).find(([, v]) => v === c);
    if (found) return found[0];
    const ch = String.fromCharCode(48 + n++);
    pal[ch] = c;
    return ch;
  };
  const p = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < w && y < h) grid[y][x] = code(c); };
  const r = (x: number, y: number, ww: number, hh: number, c: string) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) p(xx, yy, c); };
  draw(r, p);
  const sheet = render([grid.map((row) => row.join(''))], pal, outline);
  cache.set(key, sheet);
  return sheet;
}

const DESK = '#3b4260', DESK_D = '#262b40', FRAME = '#151826', SCREEN = '#0b0d18';

function desk(r: (x: number, y: number, w: number, h: number, c: string) => void, w = 16, y = 7) {
  r(0, y, w, 1, DESK); r(0, y + 1, w, 1, DESK_D); r(0, y + 2, 1, 3, DESK_D); r(w - 1, y + 2, 1, 3, DESK_D);
}

function monitor(r: (x: number, y: number, w: number, h: number, c: string) => void, x: number, y: number, w: number, h: number) {
  r(x, y, w, h, FRAME); r(x + 1, y + 1, w - 2, h - 2, SCREEN); r(x + Math.floor(w / 2) - 1, y + h, 2, 1, '#3a4160');
}

export function station(kind: AgentKind, lead: boolean, color: string): Sheet {
  const k = `prop|${kind}|${lead}|${color}`;
  if (lead && kind !== 'twin') {
    return prop(k, 20, 12, (r, p) => {
      // komuta konsolu + hologram küre
      r(2, 7, 16, 1, '#454d70'); r(1, 8, 18, 1, DESK); r(1, 9, 18, 1, DESK_D); r(1, 10, 1, 2, DESK_D); r(18, 10, 1, 2, DESK_D);
      for (let i = 0; i < 6; i++) p(4 + i * 2, 7, i % 2 ? '#f2c14e' : color);
      const cx = 10, cy = 3;
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10 && x * x + y * y >= 4) p(cx + x, cy + y, '#6fd8ff');
      p(cx, cy, color); r(cx - 1, 6, 3, 1, '#6fd8ff');
    });
  }
  switch (kind) {
    case 'dev':
      return prop(k, 16, 12, (r, p) => {
        monitor(r, 0, 0, 7, 6); monitor(r, 9, 0, 7, 6);
        const cols = ['#6fb6ff', '#5ccf8f', '#c792ea', '#f2c14e'];
        for (let y = 1; y < 5; y++) { r(1 + (y % 2), y, 2 + (y % 3), 1, cols[y % 4]); r(10, y, 1 + ((y * 3) % 4), 1, cols[(y + 1) % 4]); }
        desk(r); r(3, 8 - 1, 7, 1, '#22263a'); p(12, 6, '#3a4160');
      });
    case 'qa':
      return prop(k, 16, 12, (r, p) => {
        monitor(r, 1, 0, 9, 6);
        for (let y = 1; y < 5; y++) { p(2, y, '#5ccf8f'); r(4, y, 4, 1, '#3c4566'); }
        p(3, 2, '#ef6b6b'); p(2, 2, SCREEN);
        desk(r); r(11, 3, 4, 4, '#454d70'); p(12, 4, '#5ccf8f'); p(13, 4, '#f2c14e'); r(12, 5, 2, 1, '#6fd8ff');
      });
    case 'devops':
      return prop(k, 12, 16, (r, p) => {
        r(0, 0, 12, 16, '#20253a'); r(1, 1, 10, 14, '#141828');
        for (let u = 0; u < 4; u++) { r(1, 1 + u * 3.5 | 0, 10, 3, '#2a3048'); p(2, 2 + Math.floor(u * 3.5), u % 2 ? '#5ccf8f' : '#f2c14e'); p(4, 2 + Math.floor(u * 3.5), '#5ccf8f'); r(6, 2 + Math.floor(u * 3.5), 4, 1, '#3a4160'); }
      });
    case 'research':
      return prop(k, 16, 12, (r, p) => {
        // flaskalar + mikroskop
        r(1, 2, 3, 4, '#a9bdd9'); r(2, 3, 1, 3, '#59e39a'); r(1, 5, 3, 1, '#59e39a'); p(2, 1, '#a9bdd9');
        r(5, 3, 3, 3, '#a9bdd9'); r(6, 4, 1, 2, '#6fb6ff'); r(5, 5, 3, 1, '#6fb6ff'); p(6, 2, '#a9bdd9');
        r(11, 0, 2, 2, '#8a93b3'); r(10, 2, 2, 2, '#8a93b3'); r(11, 4, 1, 1, '#8a93b3'); r(9, 5, 5, 1, '#8a93b3');
        desk(r, 16, 6); r(0, 7, 16, 1, '#6fd8ff');
      });
    case 'writer':
      return prop(k, 16, 12, (r, p) => {
        r(4, 0, 7, 6, '#6fd8ff'); r(5, 1, 5, 4, '#e9eef7'); r(6, 2, 3, 1, '#6b7699'); r(6, 3, 2, 1, '#6b7699');
        r(12, 4, 3, 2, '#e9eef7'); r(12, 5, 3, 1, '#b8c2d6');
        desk(r, 16, 6); p(7, 6, '#6fd8ff');
      });
    case 'analyst':
      return prop(k, 16, 12, (r, p) => {
        monitor(r, 1, 0, 14, 6);
        const ys = [4, 4, 3, 4, 2, 3, 2, 1, 2, 1, 1, 1];
        ys.forEach((y, i) => p(2 + i, y, '#5ccf8f'));
        r(3, 4, 1, 1, '#f2c14e'); r(6, 3, 1, 2, '#f2c14e'); r(9, 3, 1, 2, '#f2c14e');
        desk(r);
      });
    case 'trader':
      return prop(k, 16, 12, (r, p) => {
        monitor(r, 0, 0, 10, 6);
        const candles: [number, number, number, string][] = [[2, 2, 2, '#5ccf8f'], [4, 3, 2, '#ef6b6b'], [6, 1, 3, '#5ccf8f'], [8, 1, 2, '#5ccf8f']];
        for (const [x, y, h, c] of candles) { r(x, y, 1, h, c); p(x, y - 1, c); }
        r(11, 3, 5, 4, '#7a5a3a'); r(11, 3, 5, 1, '#9a7650'); p(13, 5, '#f2c14e');
        desk(r);
      });
    default:
      return prop(k, 16, 12, (r) => { monitor(r, 3, 0, 10, 6); r(5, 2, 6, 1, color); r(5, 4, 4, 1, '#6fb6ff'); desk(r); });
  }
}

// ------------------------------------------------------------------ oda dekorları (arka duvar şeritleri) ve zeminler

export function decorStrip(theme: TeamTheme, color: string): Sheet {
  const k = `decor|${theme}|${color}`;
  if (theme === 'lab') {
    return prop(k, 24, 20, (r, p) => {
      for (const [x, liquid] of [[2, '#59e39a'], [9, '#6fb6ff'], [16, '#c792ea']] as [number, string][]) {
        r(x, 0, 6, 2, '#5c6688'); r(x, 18, 6, 2, '#5c6688');
        r(x + 1, 2, 4, 16, '#22304a'); r(x + 1, 7, 4, 11, liquid);
        p(x + 2, 9, '#e9eef7'); p(x + 3, 12, '#e9eef7'); p(x + 2, 15, '#e9eef7');
        r(x + 1, 2, 1, 16, '#9fb3d1');
      }
    });
  }
  if (theme === 'dev') {
    return prop(k, 18, 22, (r, p) => {
      r(1, 0, 16, 22, '#1a1e30'); r(2, 1, 14, 20, '#10131f');
      for (let u = 0; u < 5; u++) {
        r(2, 1 + u * 4, 14, 3, '#242a40');
        p(3, 2 + u * 4, u % 2 ? '#5ccf8f' : color); p(5, 2 + u * 4, '#5ccf8f'); p(7, 2 + u * 4, u === 2 ? '#ef6b6b' : '#5ccf8f');
        r(10, 2 + u * 4, 5, 1, '#3a4160');
      }
    });
  }
  if (theme === 'trade') {
    return prop(k, 48, 20, (r, p) => {
      r(0, 0, 48, 20, '#141020'); r(1, 1, 46, 18, '#0b0a14');
      let y = 12;
      for (let x = 3; x < 45; x += 3) {
        const up = (x * 7) % 5 < 3;
        const h = 2 + ((x * 3) % 4);
        y = Math.max(3, Math.min(15, y + (up ? -1 : 1) * ((x % 2) + 1)));
        r(x, y, 1, h, up ? '#5ccf8f' : '#ef6b6b');
        p(x, y - 1, up ? '#5ccf8f' : '#ef6b6b');
      }
      r(1, 17, 46, 1, '#f2c14e');
    });
  }
  return prop(k, 28, 20, (r, p) => {
    r(0, 0, 28, 20, '#141828'); r(1, 1, 26, 18, '#0b0d18');
    const cx = 9, cy = 10;
    for (let a = 0; a < 360; a += 6) { const t = (a * Math.PI) / 180; p(Math.round(cx + Math.cos(t) * 7), Math.round(cy + Math.sin(t) * 7), '#2f5a45'); }
    r(cx, cy - 7, 1, 7, '#5ccf8f'); p(cx + 3, cy - 2, '#f2c14e');
    for (let y = 3; y < 17; y += 3) r(19, y, 6, 1, y % 2 ? color : '#3a4160');
  });
}

export function floorTile(theme: TeamTheme, color: string): string {
  const k = `floor|${theme}|${color}`;
  if (theme === 'lab') {
    return prop(k, 16, 16, (r) => {
      r(0, 0, 16, 16, '#2a3450'); r(0, 0, 16, 1, '#435279'); r(0, 0, 1, 16, '#435279'); r(8, 0, 1, 16, '#384568'); r(0, 8, 16, 1, '#384568');
      r(1, 1, 7, 1, '#33406a');
    }, false).url;
  }
  if (theme === 'trade') {
    return prop(k, 16, 16, (r, p) => {
      r(0, 0, 16, 16, '#231a28'); p(8, 4, '#4a3a2a'); p(7, 5, '#4a3a2a'); p(9, 5, '#4a3a2a'); p(8, 6, '#4a3a2a'); p(0, 12, '#2c2232'); r(0, 15, 16, 1, '#1a131f');
    }, false).url;
  }
  if (theme === 'dev') {
    return prop(k, 16, 16, (r, p) => {
      r(0, 0, 16, 16, '#141722');
      for (let i = 0; i < 16; i += 4) { r(i, 0, 1, 16, '#1d2130'); r(0, i, 16, 1, '#1d2130'); }
      p(4, 4, shade(color, -0.4)); p(12, 12, shade(color, -0.4));
    }, false).url;
  }
  return prop(k, 16, 16, (r) => { r(0, 0, 16, 16, '#171a26'); r(0, 0, 16, 1, '#232738'); r(0, 0, 1, 16, '#232738'); }, false).url;
}
