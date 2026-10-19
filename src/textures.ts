// Tarayıcıda canvas ile üretilen piksel dokular (Terraria esintili): yıldız alanı, zindan tuğlası, taş, gezegen.
// Bir kez üretilir, data URL olarak önbelleğe alınır; CSS'te `image-rendering: pixelated` ile büyütülür.

const cache = new Map<string, string>();

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(r: number, g: number, b: number, a = 1) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

function shade([r, g, b]: [number, number, number], k: number) {
  return k >= 0 ? [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k] : [r * (1 + k), g * (1 + k), b * (1 + k)];
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx, px: (x: number, y: number, col: string, s = 1) => { ctx.fillStyle = col; ctx.fillRect(x, y, s, s); } };
}

function memo(key: string, make: () => string) {
  const hit = cache.get(key);
  if (hit) return hit;
  const v = make();
  cache.set(key, v);
  return v;
}

/** Tekrarlanan yıldız alanı. `big` katmanında daha az ama daha parlak, artı şeklinde ışıltılı yıldızlar olur. */
export function stars(size: number, count: number, seed: number, big = false) {
  return memo(`stars-${size}-${count}-${seed}-${big}`, () => {
    const { c, px } = canvas(size, size);
    const r = rng(seed);
    const tints = [[255, 255, 255], [190, 210, 255], [255, 230, 200], [210, 190, 255]] as const;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(r() * size);
      const y = Math.floor(r() * size);
      const [tr, tg, tb] = tints[Math.floor(r() * tints.length)];
      const a = big ? 0.75 + r() * 0.25 : 0.25 + r() * 0.55;
      px(x, y, rgb(tr, tg, tb, a));
      if (big && r() < 0.45) {
        // 4 köşeli ışıltı
        const d = rgb(tr, tg, tb, a * 0.45);
        px(x - 1, y, d); px(x + 1, y, d); px(x, y - 1, d); px(x, y + 1, d);
        if (r() < 0.4) { px(x - 2, y, rgb(tr, tg, tb, a * 0.2)); px(x + 2, y, rgb(tr, tg, tb, a * 0.2)); px(x, y - 2, rgb(tr, tg, tb, a * 0.2)); px(x, y + 2, rgb(tr, tg, tb, a * 0.2)); }
      }
    }
    return c.toDataURL();
  });
}

/** Zindan tuğlası: 16×8 tuğlalar, kaydırılmış sıralar, harç çizgileri, üstte ışık altta gölge, piksel gürültüsü. */
export function bricks(hex: string, seed = 7) {
  return memo(`bricks-${hex}-${seed}`, () => {
    const W = 32, H = 32;
    const { c, px } = canvas(W, H);
    const base = hexToRgb(hex);
    const r = rng(seed);
    const mortar = shade(base, -0.72);
    for (let y = 0; y < H; y++) {
      const row = Math.floor(y / 8);
      const off = row % 2 ? 8 : 0;
      for (let x = 0; x < W; x++) {
        const bx = (x + off) % 16;
        const by = y % 8;
        if (by === 7 || bx === 15) { px(x, y, rgb(...(mortar as [number, number, number]))); continue; }
        let k = (r() - 0.5) * 0.16;
        // tuğla başına ton farkı
        const brickId = Math.floor((x + off) / 16) * 7 + row * 13;
        k += ((brickId * 37) % 11) / 11 * 0.12 - 0.06;
        if (by === 0) k += 0.22;
        if (bx === 0) k += 0.1;
        if (by === 6) k -= 0.22;
        if (bx === 14) k -= 0.12;
        px(x, y, rgb(...(shade(base, k) as [number, number, number])));
      }
    }
    return c.toDataURL();
  });
}

/** Düzensiz taş doku (koridor ve zemin için). */
export function stone(hex: string, seed = 3) {
  return memo(`stone-${hex}-${seed}`, () => {
    const S = 32;
    const { c, px } = canvas(S, S);
    const base = hexToRgb(hex);
    const r = rng(seed);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let k = (r() - 0.5) * 0.2;
        // iri taş lekeleri
        const n = Math.sin(x * 0.55 + seed) * Math.cos(y * 0.6 - seed) + Math.sin((x + y) * 0.3);
        k += n * 0.07;
        px(x, y, rgb(...(shade(base, k) as [number, number, number])));
      }
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S);
      px(x, y, rgb(...(shade(base, -0.45) as [number, number, number])));
    }
    return c.toDataURL();
  });
}

/** Dithering ile gölgelenmiş piksel gezegen (halkalı). */
export function planet(size: number, a: string, b: string, seed = 11, ring = true) {
  return memo(`planet-${size}-${a}-${b}-${seed}-${ring}`, () => {
    const W = Math.round(size * 1.6), H = size;
    const { c, px } = canvas(W, H);
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const r = rng(seed);
    const cx = W / 2, cy = H / 2, R = size / 2 - 1;
    const ringBack: [number, number][] = [];
    const ringFront: [number, number][] = [];
    if (ring) {
      for (let t = 0; t < Math.PI * 2; t += 0.008) {
        for (const rr of [R * 1.35, R * 1.45, R * 1.52]) {
          const x = Math.round(cx + Math.cos(t) * rr), y = Math.round(cy + Math.sin(t) * rr * 0.28);
          (Math.sin(t) < 0 ? ringBack : ringFront).push([x, y]);
        }
      }
      for (const [x, y] of ringBack) px(x, y, rgb(...(shade(cb, 0.25) as [number, number, number]), 0.55));
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        // bantlar
        const band = Math.sin((dy / R) * 6 + Math.sin(dx * 0.15 + seed) * 0.6);
        const mix = band > 0.2 ? 0 : band > -0.4 ? 0.5 : 1;
        const base = [ca[0] + (cb[0] - ca[0]) * mix, ca[1] + (cb[1] - ca[1]) * mix, ca[2] + (cb[2] - ca[2]) * mix] as [number, number, number];
        // ışık sol üstten
        const light = (-dx * 0.6 - dy * 0.8) / R;
        let k = light * 0.35 - (d / R) * 0.25;
        // dithering
        if (light < -0.3 && (x + y) % 2 === 0) k -= 0.25;
        if (light < -0.6) k -= 0.3;
        k += (r() - 0.5) * 0.06;
        px(x, y, rgb(...(shade(base, k) as [number, number, number])));
      }
    }
    if (ring) for (const [x, y] of ringFront) px(x, y, rgb(...(shade(cb, 0.35) as [number, number, number]), 0.85));
    return c.toDataURL();
  });
}

/** Küçük piksel asteroit. */
export function asteroid(size: number, seed: number) {
  return memo(`asteroid-${size}-${seed}`, () => {
    const { c, px } = canvas(size, size);
    const r = rng(seed);
    const base: [number, number, number] = [88, 82, 104];
    const cx = size / 2, cy = size / 2;
    const bumps = Array.from({ length: 7 }, () => 0.7 + r() * 0.3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const ang = Math.atan2(dy, dx);
        const i = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * bumps.length) % bumps.length;
        const R = (size / 2 - 1) * bumps[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        let k = (-dx - dy) / (size * 1.2) * 0.6 + (r() - 0.5) * 0.15;
        if (r() < 0.06) k -= 0.35;
        px(x, y, rgb(...(shade(base, k) as [number, number, number])));
      }
    }
    return c.toDataURL();
  });
}

/** Rengi koyulaştırır (k: 0..1). Ekip renginden zindan tuğlası tonu üretmek için. */
export function darken(hex: string, k: number) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** Uzay istasyonu dış kaplaması: 16×16 metal paneller, ek yerleri, kenar parlaması, köşelerde perçin. */
export function plating(hex: string, seed = 5) {
  return memo(`plating-${hex}-${seed}`, () => {
    const S = 32;
    const { c, px } = canvas(S, S);
    const base = hexToRgb(hex);
    const r = rng(seed);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const bx = x % 16, by = y % 16;
        const panel = Math.floor(x / 16) + Math.floor(y / 16) * 2;
        let k = (r() - 0.5) * 0.05 + ((panel * 29) % 7) / 7 * 0.08 - 0.04;
        if (bx === 15 || by === 15) k = -0.55; // ek yeri
        else if (bx === 0 || by === 0) k += 0.16; // parlak kenar
        else if (bx === 14 || by === 14) k -= 0.14;
        // fırçalanmış metal çizgileri
        if (by % 4 === 2 && bx > 1 && bx < 14) k += 0.03;
        px(x, y, rgb(...(shade(base, k) as [number, number, number])));
      }
    }
    // perçinler
    for (const [ox, oy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
      for (const [rx, ry] of [[2, 2], [12, 2], [2, 12], [12, 12]]) {
        px(ox + rx, oy + ry, rgb(...(shade(base, 0.35) as [number, number, number])));
        px(ox + rx + 1, oy + ry + 1, rgb(...(shade(base, -0.4) as [number, number, number])));
      }
    }
    return c.toDataURL();
  });
}

/** Metal ızgara zemin. */
export function grating(hex: string) {
  return memo(`grating-${hex}`, () => {
    const S = 16;
    const { c, px } = canvas(S, S);
    const base = hexToRgb(hex);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const gx = x % 8, gy = y % 8;
        let k = 0;
        if (gx === 0 || gy === 0) k = 0.18;
        else if (gx === 7 || gy === 7) k = -0.3;
        else if ((gx + gy) % 2 === 0 && gx > 1 && gy > 1 && gx < 6 && gy < 6) k = -0.18;
        px(x, y, rgb(...(shade(base, k) as [number, number, number])));
      }
    }
    return c.toDataURL();
  });
}
