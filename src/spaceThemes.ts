// Arka plandaki uzayın renk temaları: nebula bulutları, zemin rengi, gezegen ve ay. Seçim bu cihazda saklanır.

export interface SpaceTheme {
  id: string;
  label: string;
  /** Uzayın zemin rengi */
  base: string;
  /** Nebula katmanı (CSS background) */
  nebula: string;
  /** Halkalı gezegenin iki rengi ve parıltısı */
  planet: [string, string];
  glow: string;
  moon: [string, string];
}

const vignette = 'radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.6))';
const cloud = (w: number, h: number, x: number, y: number, rgba: string) => `radial-gradient(ellipse ${w}% ${h}% at ${x}% ${y}%, ${rgba}, transparent 70%)`;

export const SPACE_THEMES: SpaceTheme[] = [
  {
    id: 'nebula',
    label: 'Mor nebula',
    base: '#05060c',
    nebula: [
      cloud(55, 45, 18, 28, 'rgba(118, 64, 196, 0.32)'),
      cloud(50, 40, 82, 74, 'rgba(40, 92, 196, 0.30)'),
      cloud(35, 30, 62, 18, 'rgba(40, 170, 170, 0.14)'),
      cloud(40, 35, 35, 85, 'rgba(196, 64, 140, 0.13)'),
      vignette,
    ].join(', '),
    planet: ['#6b5bd6', '#d07ac2'],
    glow: 'rgba(140, 100, 230, 0.25)',
    moon: ['#8d95b8', '#5c6283'],
  },
  {
    id: 'abyss',
    label: 'Derin okyanus',
    base: '#02060d',
    nebula: [
      cloud(60, 45, 22, 30, 'rgba(30, 96, 200, 0.44)'),
      cloud(45, 40, 80, 70, 'rgba(20, 170, 200, 0.32)'),
      cloud(35, 30, 60, 15, 'rgba(70, 120, 255, 0.16)'),
      cloud(40, 30, 30, 88, 'rgba(0, 210, 190, 0.10)'),
      vignette,
    ].join(', '),
    planet: ['#2f6fd0', '#8fe3ff'],
    glow: 'rgba(80, 180, 255, 0.28)',
    moon: ['#9fb6d6', '#4e6a8c'],
  },
  {
    id: 'crimson',
    label: 'Kızıl bulutsu',
    base: '#0a0306',
    nebula: [
      cloud(55, 45, 20, 30, 'rgba(200, 40, 60, 0.32)'),
      cloud(50, 40, 80, 72, 'rgba(230, 110, 40, 0.24)'),
      cloud(35, 30, 60, 16, 'rgba(255, 60, 120, 0.14)'),
      cloud(40, 35, 35, 86, 'rgba(140, 30, 90, 0.18)'),
      vignette,
    ].join(', '),
    planet: ['#c2412d', '#f2a65a'],
    glow: 'rgba(240, 100, 60, 0.28)',
    moon: ['#b8968d', '#6e4a44'],
  },
  {
    id: 'aurora',
    label: 'Zümrüt aurora',
    base: '#020a08',
    nebula: [
      cloud(60, 40, 25, 25, 'rgba(30, 190, 120, 0.34)'),
      cloud(50, 40, 78, 70, 'rgba(20, 150, 170, 0.30)'),
      cloud(40, 28, 55, 12, 'rgba(140, 255, 160, 0.10)'),
      cloud(38, 32, 32, 86, 'rgba(70, 90, 200, 0.14)'),
      vignette,
    ].join(', '),
    planet: ['#2f9e6e', '#a8f0c8'],
    glow: 'rgba(90, 230, 160, 0.25)',
    moon: ['#a6c9b8', '#4f7466'],
  },
  {
    id: 'solar',
    label: 'Altın güneş',
    base: '#090603',
    nebula: [
      cloud(50, 45, 78, 22, 'rgba(255, 180, 60, 0.40)'),
      cloud(55, 40, 20, 70, 'rgba(210, 90, 30, 0.30)'),
      cloud(30, 26, 82, 20, 'rgba(255, 230, 150, 0.16)'),
      cloud(40, 35, 40, 90, 'rgba(150, 60, 120, 0.12)'),
      vignette,
    ].join(', '),
    planet: ['#d9a23a', '#ffe08a'],
    glow: 'rgba(255, 200, 90, 0.30)',
    moon: ['#c9b48d', '#7a6440'],
  },
  {
    id: 'rose',
    label: 'Pembe galaksi',
    base: '#0a0410',
    nebula: [
      cloud(55, 45, 22, 30, 'rgba(220, 70, 180, 0.30)'),
      cloud(50, 40, 80, 72, 'rgba(140, 70, 230, 0.28)'),
      cloud(35, 30, 60, 18, 'rgba(255, 140, 200, 0.14)'),
      cloud(40, 35, 30, 86, 'rgba(90, 60, 220, 0.14)'),
      vignette,
    ].join(', '),
    planet: ['#b04ad6', '#ff9ad5'],
    glow: 'rgba(240, 120, 220, 0.28)',
    moon: ['#c7a3c9', '#6c4a74'],
  },
  {
    id: 'void',
    label: 'Sessiz boşluk',
    base: '#010103',
    nebula: [cloud(60, 50, 50, 40, 'rgba(90, 100, 140, 0.10)'), cloud(40, 30, 80, 80, 'rgba(60, 70, 110, 0.08)'), vignette].join(', '),
    planet: ['#4e566f', '#a3abc4'],
    glow: 'rgba(160, 170, 210, 0.15)',
    moon: ['#8d95b8', '#4a5070'],
  },
];

export const themeById = (id: string | null | undefined) => SPACE_THEMES.find((t) => t.id === id) ?? SPACE_THEMES[0];
