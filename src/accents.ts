// Vurgu rengi: düğmeler, sekmeler, seçimler ve ikizin nükleer reaktöründeki ışıklar bu renge bürünür.
// Seçim bu cihazda saklanır; renkler styles.css'teki --accent* değişkenlerine yazılır.

export interface Accent {
  id: string;
  label: string;
  /** Ana renk */
  hex: string;
  /** Parlak ton (reaktör küresi, başlıklar) */
  hi: string;
  /** En açık ton (kürenin merkezi) */
  pale: string;
  /** Koyu ton, "r, g, b" (kürenin dış halesi) */
  deep: string;
  /** Vurgu renginin üstündeki yazı */
  on: string;
}

export const ACCENTS: Accent[] = [
  { id: 'green', label: 'Radyoaktif yeşil', hex: '#5ccf8f', hi: '#9dffd0', pale: '#f2fff7', deep: '30, 110, 72', on: '#0b1a12' },
  { id: 'cyan', label: 'Plazma mavisi', hex: '#4fd2ff', hi: '#a6ecff', pale: '#effbff', deep: '20, 90, 130', on: '#04141c' },
  { id: 'blue', label: 'Kobalt', hex: '#6b8cff', hi: '#b3c4ff', pale: '#f1f4ff', deep: '40, 55, 140', on: '#0a0f24' },
  { id: 'violet', label: 'Mor enerji', hex: '#b48cff', hi: '#dccaff', pale: '#f7f2ff', deep: '80, 50, 150', on: '#160c26' },
  { id: 'pink', label: 'Neon pembe', hex: '#ff6fb5', hi: '#ffb3d8', pale: '#fff1f8', deep: '140, 40, 90', on: '#26091a' },
  { id: 'red', label: 'Kızıl çekirdek', hex: '#ff6b6b', hi: '#ffb0a8', pale: '#fff2f0', deep: '140, 35, 35', on: '#260a0a' },
  { id: 'orange', label: 'Turuncu alev', hex: '#ff9a4a', hi: '#ffcf9e', pale: '#fff6ee', deep: '150, 70, 20', on: '#261306' },
  { id: 'gold', label: 'Altın', hex: '#f2c14e', hi: '#ffe39a', pale: '#fffaeb', deep: '140, 100, 20', on: '#241a05' },
];

export const accentById = (id: string | null | undefined) => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];

const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

/** Vurgu rengini bir belgeye uygular (ana pencere ya da uçan pencere). */
export function applyAccent(id: string | null | undefined, doc: Document = document) {
  const a = accentById(id);
  const st = doc.documentElement.style;
  st.setProperty('--accent', a.hex);
  st.setProperty('--accent-rgb', rgbOf(a.hex));
  st.setProperty('--accent-hi', a.hi);
  st.setProperty('--accent-pale', a.pale);
  st.setProperty('--accent-deep-rgb', a.deep);
  st.setProperty('--on-accent', a.on);
}
