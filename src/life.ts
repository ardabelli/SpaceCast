// Pil dostu canlılık: piksel oyunlardaki gibi saniyede ~6-7 karelik tek bir döngü.
// Sürekli çalışan CSS animasyonları ekran kartını saniyede 60 kez uyandırır; bu döngü ise yalnızca kendi
// karelerinde birkaç küçük öğenin stilini değiştirir, aradaki zamanda ekran tamamen boşta kalır.
// Her karakterin kendi küçük aklı var (yürü, dur, etrafa bak, dön), hepsi aynı anda aynı şeyi yapmaz.
// Pencere gizliyken, bir pencere/panel açıkken ya da "Canlı animasyonlar" açıkken (CSS devralır) çalışmaz.

const TICK_MS = 150;

interface Walker {
  x: number;
  dir: 1 | -1;
  wait: number;
  frame: 0 | 1;
  bob: number;
  next: number;
}

const walkers = new WeakMap<HTMLElement, Walker>();
const ringAngle = new WeakMap<Element, number>();
let t = 0;
let shooting = -1;
let timer: ReturnType<typeof setInterval> | null = null;

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const each = (sel: string, fn: (el: HTMLElement) => void) => document.querySelectorAll<HTMLElement>(sel).forEach(fn);
const px = (el: HTMLElement, name: string) => parseFloat(el.style.getPropertyValue(name)) || 0;

function setFrame(sprite: HTMLElement | null, frame: 0 | 1, dir: 1 | -1) {
  if (!sprite) return;
  const fw = px(sprite, '--fw');
  sprite.style.backgroundPosition = `${frame ? -fw : 0}px 0`;
  sprite.style.transform = dir < 0 ? 'scaleX(-1)' : '';
}

/** İstasyondaki karakter: çalışıyorsa masasının çevresinde dolaşır, boştaysa nefes alır ve arada döner. */
function stepCharacter(el: HTMLElement) {
  let w = walkers.get(el);
  if (!w) {
    w = { x: 0, dir: Math.random() < 0.5 ? 1 : -1, wait: rand(0, 10), frame: 0, bob: 0, next: rand(4, 30) };
    walkers.set(el, w);
  }
  const sprite = el.querySelector<HTMLElement>('.npc');
  const range = Math.abs(px(el, '--dx')) || 30;
  const working = el.classList.contains('work');
  const idle = el.classList.contains('idle');

  if (working) {
    if (w.wait > 0) {
      // durup etrafa bakıyor
      w.wait--;
      w.frame = 0;
      if (Math.random() < 0.08) w.dir = w.dir === 1 ? -1 : 1;
    } else {
      w.x += w.dir * 3;
      w.frame = w.frame ? 0 : 1;
      if (Math.abs(w.x) >= range) { w.x = Math.sign(w.x) * range; w.dir = w.dir === 1 ? -1 : 1; w.wait = rand(4, 14); }
      else if (Math.random() < 0.04) w.wait = rand(3, 10);
    }
  } else {
    // boşta ya da beklerken: yavaşça masasına döner, nefes alır, arada bir yana bakar
    if (w.x !== 0) { w.x -= Math.sign(w.x) * Math.min(2, Math.abs(w.x)); w.frame = w.frame ? 0 : 1; w.dir = w.x > 0 ? -1 : 1; }
    else {
      w.frame = 0;
      if (idle && --w.next <= 0) {
        const r = Math.random();
        if (r < 0.45) w.dir = w.dir === 1 ? -1 : 1;
        else if (r < 0.8) w.bob = 2;
        else { w.x = (Math.random() < 0.5 ? -1 : 1) * 4; w.frame = 1; }
        w.next = rand(12, 45);
      }
    }
  }
  const lift = w.bob > 0 ? 1 : 0;
  if (w.bob > 0) w.bob--;
  el.style.transform = `translate(${w.x}px, ${lift}px)`;
  setFrame(sprite, w.frame, w.dir);

  const bubble = el.querySelector<HTMLElement>('.bubble');
  if (bubble) {
    const fast = bubble.classList.contains('warn');
    const up = fast ? t % 2 === 0 : Math.floor(t / 3) % 2 === 0;
    bubble.style.transform = `translate(-50%, ${up ? -2 : 0}px)`;
  }
}

function stepReactor() {
  const room = document.querySelector('.reactor-room');
  if (!room) return;
  const hot = room.classList.contains('overload');
  const period = hot ? 6 : 16;
  const phase = (t % period) / period;
  const orb = room.querySelector<HTMLElement>('.orb');
  if (orb) orb.style.transform = `scale(${(1 + 0.07 * Math.sin(phase * Math.PI * 2)).toFixed(3)})`;
  room.querySelectorAll<HTMLElement>('.ring').forEach((r, i) => {
    const tilt = [0, 60, -60][i] ?? 0;
    const a = ((ringAngle.get(r) ?? 0) + [9, -6, 5][i] * (hot ? 2 : 1)) % 360;
    ringAngle.set(r, a);
    r.style.transform = `rotate(${tilt + a}deg)`;
  });
  const knight = room.querySelector<HTMLElement>('.knight');
  if (knight) knight.style.transform = `translateY(${[0, -1, -2, -3, -3, -2, -1, 0][Math.floor(t / 2) % 8]}px)`;
  const trefoil = room.querySelector<HTMLElement>('.trefoil');
  if (trefoil) trefoil.style.transform = `rotate(${(t * 1.5) % 360}deg)`;
  room.querySelectorAll<HTMLElement>('.arc').forEach((a) => { a.style.opacity = Math.random() < (hot ? 0.18 : 0.035) ? '1' : '0'; });
  room.querySelectorAll<HTMLElement>('.beacon').forEach((b, i) => { b.style.opacity = Math.floor((t + i * 3) / 5) % 2 ? '0.25' : '1'; });
}

function stepCables() {
  each('.pipe-lane', (p) => {
    if (p.classList.contains('paused')) return;
    const speed = p.classList.contains('hot') ? 5 : 1;
    if (!p.classList.contains('hot') && t % 2) return;
    const off = (parseFloat(p.style.strokeDashoffset) || 0) + (p.classList.contains('in') ? speed : -speed);
    p.style.strokeDashoffset = String(off % 320);
  });
}

function stepRooms() {
  each('.leds', (l) => { if (t % 4 === 0) l.style.opacity = Math.floor(t / 4) % 2 ? '0.2' : '0.8'; });
  each('.ticker', (k) => {
    const half = k.scrollWidth / 2 || 1;
    const x = ((parseFloat(k.dataset.x ?? '0') - 2) % half);
    k.dataset.x = String(x);
    k.style.transform = `translateX(${x}px)`;
  });
  each('.bubbles', (b) => { if (t % 2 === 0) b.style.backgroundPositionY = `${-(Math.floor(t / 2) * 2 % 54)}px`; });
}

function stepSpace() {
  const glint = document.querySelector<HTMLElement>('.starlayer.glint');
  if (glint && t % 3 === 0) glint.style.opacity = (0.35 + Math.random() * 0.65).toFixed(2);
  const planet = document.querySelector<HTMLElement>('.planet');
  if (planet && t % 6 === 0) planet.style.transform = `translateY(${[0, -2, -4, -5, -4, -2][Math.floor(t / 6) % 6]}px)`;
  // ara sıra kayan yıldız
  const star = document.querySelector<HTMLElement>('.shooting.s1');
  if (!star) return;
  if (shooting < 0 && Math.random() < 0.004) shooting = 0;
  if (shooting >= 0) {
    star.style.opacity = shooting < 7 ? '1' : '0';
    star.style.transform = `translate(${shooting * 60}px, ${shooting * 32}px) rotate(-28deg)`;
    if (++shooting > 8) { shooting = -1; star.style.opacity = '0'; }
  }
}

function tick() {
  if (document.hidden) return;
  const body = document.body;
  if (body.classList.contains('lively') || body.classList.contains('overlay-open')) return;
  t++;
  each('.npc-wrap', stepCharacter);
  stepReactor();
  stepCables();
  stepRooms();
  stepSpace();
}

/** Döngünün yazdığı stilleri temizler (canlı animasyonlara geçince CSS devralsın). */
function clearStyles() {
  each('.npc-wrap, .npc-wrap .npc, .npc-wrap .bubble, .orb, .ring, .knight, .trefoil, .arc, .beacon, .leds, .ticker, .bubbles, .starlayer.glint, .planet, .shooting', (el) => {
    el.style.removeProperty('transform');
    el.style.removeProperty('opacity');
    el.style.removeProperty('background-position');
    el.style.removeProperty('background-position-y');
  });
  each('.pipe-lane', (p) => p.style.removeProperty('stroke-dashoffset'));
}

export function startLife(isLively: () => boolean) {
  if (timer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setInterval(() => {
    if (isLively()) return;
    tick();
  }, TICK_MS);
}

export function onLivelyChange(lively: boolean) {
  if (lively) clearStyles();
}
