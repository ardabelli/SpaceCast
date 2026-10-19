// ÜS: oyun gibi üstten görünüm. Ortada ikizin nükleer reaktörü, etrafında temalı ekip odaları
// (laboratuvar, atölye, ticaret katı…), içlerinde rollerine göre giyinmiş NPC ajanlar.
// Gözlemci kamerası: sürükle = gez, tekerlek/iki parmak = yakınlaş, odaya tıkla = odaklan.

import { anyBusy } from '../../shared/chats.ts';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { agentStatus, currentActivity, taskProgress, type AgentStatus } from '../../shared/engine.ts';
import { THEMES, themeOf } from '../../shared/meta.ts';
import { twinOf } from '../../shared/twin.ts';
import type { Agent, AppState, Team } from '../../shared/types.ts';
import { Icon, TeamIcon } from '../icons.tsx';
import { Npc, Prop, agentLook, sheetFor } from '../npc.tsx';
import { decorStrip, floorTile, station, twinSprite } from '../pixelart.ts';
import { useAppState, useStore } from '../store.ts';
import { asteroid, darken, plating } from '../textures.ts';
import { STATUS_LABEL, money } from '../ui.tsx';
import { Terminal } from './Terminal.tsx';

type Box = { x: number; y: number; w: number; h: number };

/** Son sürüklemenin zamanı: sürükleme bitince gelen tıklama karakter panelini açmasın. */
const drag = { at: 0 };
const justDragged = () => Date.now() - drag.at < 250;
type Cam = { x: number; y: number; k: number };

function layout(teamCount: number, narrow: boolean) {
  if (narrow) {
    const W = 400;
    const RW = 360, RH = 340;
    const core: Box = { x: 20, y: 20, w: 360, h: 250 };
    const rooms: Box[] = Array.from({ length: teamCount }, (_, i) => ({ x: 20, y: 320 + i * (RH + 50), w: RW, h: RH }));
    const H = (rooms.at(-1)?.y ?? core.y + core.h) + RH + 40;
    return { W, H, core, rooms };
  }
  const W = 1500, H = 1100, RW = 380, RH = 340;
  const core: Box = { x: 600, y: 420, w: 300, h: 260 };
  const slots = [[60, 40], [1060, 40], [560, 740], [60, 700], [1060, 700], [560, 20]];
  const rooms: Box[] = Array.from({ length: teamCount }, (_, i) => {
    const [x, y] = slots[i % slots.length];
    const ring = Math.floor(i / slots.length);
    return { x: x + ring * 50, y: y + ring * 50, w: RW, h: RH };
  });
  return { W, H, core, rooms };
}

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function teamState(s: AppState, team: Team) {
  const members = s.agents.filter((a) => a.teamId === team.id);
  const st = members.map((a) => agentStatus(s, a.id));
  const waiting = st.includes('waiting');
  const busy = st.some((x) => x === 'working' || x === 'managing' || x === 'waiting');
  const paused = members.length > 0 && st.every((x) => x === 'paused');
  return { members, waiting, busy, paused };
}

// ------------------------------------------------------------------ kamera

function useCamera(world: { W: number; H: number }, narrow: boolean) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, k: 1 });
  const [smooth, setSmooth] = useState(false);
  const moved = useRef(false);
  const touched = useRef(false);
  const dragDist = useRef(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback((): Cam => {
    if (!size.w) return { x: 0, y: 0, k: 1 };
    if (narrow) return { x: 0, y: 0, k: size.w / world.W };
    const k = Math.min(size.w / world.W, size.h / world.H) * 0.96;
    return { x: (size.w - world.W * k) / 2, y: (size.h - world.H * k) / 2, k };
  }, [size.w, size.h, world.W, world.H, narrow]);

  useEffect(() => { if (!touched.current) setCam(fit()); }, [fit]);

  const animate = (c: Cam) => {
    setSmooth(true);
    setCam(c);
    window.setTimeout(() => setSmooth(false), 480);
  };

  const zoomAt = (factor: number, px: number, py: number) => {
    touched.current = true;
    setCam((c) => {
      const k = Math.max(0.25, Math.min(5, c.k * factor));
      const f = k / c.k;
      return { k, x: px - (px - c.x) * f, y: py - (py - c.y) * f };
    });
  };

  // tekerlek / trackpad: yakınlaş (sayfanın kaymasını engellemek için pasif olmayan dinleyici)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || !narrow) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
      else { touched.current = true; setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY })); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [narrow]);

  // sürükleyerek gezme + iki parmakla yakınlaşma
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragDist.current = 0;
    if (pointers.current.size > 1) return;
    const move = (ev: PointerEvent) => {
      const prev = pointers.current.get(ev.pointerId);
      if (!prev) return;
      if (pointers.current.size === 2) {
        const other = [...pointers.current.entries()].find(([id]) => id !== ev.pointerId)![1];
        const d = Math.hypot(ev.clientX - other.x, ev.clientY - other.y);
        const r = wrap.current!.getBoundingClientRect();
        if (pinch.current) zoomAt(d / pinch.current.d, (ev.clientX + other.x) / 2 - r.left, (ev.clientY + other.y) / 2 - r.top);
        pinch.current = { d };
        dragDist.current += 10;
        moved.current = true;
        drag.at = Date.now();
      } else {
        const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
        dragDist.current += Math.abs(dx) + Math.abs(dy);
        if (dragDist.current > 5) {
          touched.current = true;
          moved.current = true;
          drag.at = Date.now();
          setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
        }
      }
      pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      pointers.current.delete(ev.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.setTimeout(() => { moved.current = false; }, 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const focus = (b: Box) => {
    touched.current = true;
    const k = Math.min(4, Math.min(size.w / b.w, size.h / b.h) * 0.82);
    const c = center(b);
    animate({ k, x: size.w / 2 - c.x * k, y: size.h / 2 - c.y * k });
  };
  const reset = () => { touched.current = false; animate(fit()); };
  const zoomBtn = (f: number) => zoomAt(f, size.w / 2, size.h / 2);
  /** Sürükleme sonrası gelen tıklamayı yok say */
  const wasDrag = () => moved.current || justDragged();

  return { wrap, cam, smooth, onPointerDown, focus, reset, zoomBtn, wasDrag };
}

// ------------------------------------------------------------------ üs

export function Base() {
  const s = useAppState();
  const go = useStore((x) => x.go);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 720);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 720);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const L = layout(s.teams.length, narrow);
  const camera = useCamera(L, narrow);
  const twin = twinOf(s);
  const coreC = center(L.core);
  const team = s.teams.find((t) => t.id === openTeam);
  const running = s.missions.filter((m) => m.status === 'running').length;

  const focusOn = (id: string, b: Box) => {
    if (camera.wasDrag()) return;
    setFocused(id);
    camera.focus(b);
  };

  return (
    <div className="base-root">
      <div className="base" ref={camera.wrap} onPointerDown={camera.onPointerDown}>
        <div
          className={`world ${camera.smooth ? 'smooth' : ''}`}
          style={{ width: L.W, height: L.H, transform: `translate3d(${camera.cam.x}px, ${camera.cam.y}px, 0) scale(${camera.cam.k})` }}
        >
          {!narrow && <Decor />}
          <svg className="corridors" width={L.W} height={L.H}>
            <defs>
              <pattern id="stone" patternUnits="userSpaceOnUse" width="64" height="64">
                <image href={plating('#2b3046', 2)} width="64" height="64" style={{ imageRendering: 'pixelated' }} />
              </pattern>
            </defs>
            {s.teams.map((t, i) => {
              const r = L.rooms[i];
              const c = center(r);
              const d = narrow ? `M${coreC.x} ${L.core.y + L.core.h} V${r.y}` : `M${coreC.x} ${coreC.y} H${c.x} V${c.y}`;
              const { busy, paused } = teamState(s, t);
              const mode = paused ? 'paused' : busy ? 'hot' : 'idle';
              // İki şerit: yeşil = ikizden odaya giden emirler, kırmızı = odadan ikize dönen raporlar
              return (
                <g key={t.id}>
                  <path d={d} className="pipe-outer" />
                  <path d={d} className="pipe-inner" />
                  <path d={d} className="pipe-cable" transform="translate(-5 -5)" />
                  <path d={d} className="pipe-cable" transform="translate(5 5)" />
                  <path d={d} className={`pipe-glow out ${mode}`} transform="translate(-5 -5)" />
                  <path d={d} className={`pipe-glow in ${mode}`} transform="translate(5 5)" />
                  <path d={d} className={`pipe-lane out ${mode}`} transform="translate(-5 -5)" />
                  <path d={d} className={`pipe-lane in ${mode}`} transform="translate(5 5)" />
                </g>
              );
            })}
          </svg>

          {twin && (
            <Reactor s={s} twin={twin} box={L.core} running={running} onClick={() => focusOn('core', L.core)} onTalk={() => go('twin')} />
          )}

          {s.teams.map((t, i) => (
            <Room
              key={t.id}
              s={s}
              team={t}
              box={L.rooms[i]}
              index={i}
              focused={focused === t.id}
              onFocus={() => focusOn(t.id, L.rooms[i])}
              onOpen={() => setOpenTeam(t.id)}
            />
          ))}
        </div>

        {s.teams.length === 0 && <div className="base-empty">Henüz oda yok. Üstteki Ekipler bölümünden bir ekip kur.</div>}

        <div className="cam-ctl">
          <button className="icon-btn" onClick={() => camera.zoomBtn(1.3)} title="Yakınlaş"><span className="pm">+</span></button>
          <button className="icon-btn" onClick={() => camera.zoomBtn(1 / 1.3)} title="Uzaklaş"><span className="pm">−</span></button>
          <button className="icon-btn" onClick={() => { setFocused(null); camera.reset(); }} title="Tümünü göster"><Icon name="expand" size={15} /></button>
        </div>
        {!narrow && <div className="cam-hint">Sürükle: gez · Tekerlek: yakınlaş · Odaya tıkla: odaklan · Karaktere tıkla: ajan paneli</div>}
      </div>
      {team && <Terminal team={team} index={s.teams.indexOf(team)} onClose={() => setOpenTeam(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ reaktör (dijital ikiz)

function Reactor({ s, twin, box, running, onClick, onTalk }: { s: AppState; twin: Agent; box: Box; running: number; onClick: () => void; onTalk: () => void }) {
  const st = agentStatus(s, twin.id);
  const pending = s.approvals.filter((a) => a.status === 'pending').length;
  const thinking = anyBusy(s);
  const power = Math.min(100, 18 + running * 22 + (thinking ? 25 : 0));
  const pulse = thinking ? 0.7 : running ? 1.3 : 3.2;
  const line = pending ? `${pending} karar seni bekliyor` : thinking ? 'hesaplıyor…' : running ? `${running} operasyona güç veriyor` : 'beklemede';
  return (
    <div
      className={`core reactor-room ${thinking ? 'overload' : ''}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ['--wall' as string]: `url(${plating('#262a4a', 4)})`, ['--pulse' as string]: `${pulse}s` } as CSSProperties}
      onClick={onClick}
    >
      <span className="beacon l" />
      <span className="beacon r" style={{ animationDelay: '-0.9s' }} />
      <div className="reactor">
        <svg className="trefoil" viewBox="-50 -50 100 100" aria-hidden="true">
          {[0, 120, 240].map((a) => (
            <path key={a} d="M0 0 L-17 -30 A35 35 0 0 1 17 -30 Z" transform={`rotate(${a})`} />
          ))}
          <circle r="8" />
        </svg>
        <span className="orb" />
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <svg className="arcs" viewBox="0 0 120 120" aria-hidden="true">
          <path className="arc a1" d="M60 14 L52 28 L62 32 L54 46" />
          <path className="arc a2" d="M104 60 L90 54 L88 64 L74 58" />
          <path className="arc a3" d="M18 80 L32 72 L34 82 L46 76" />
        </svg>
        <div className={`knight ${st !== 'idle' ? 'active' : ''}`}>
          <Npc sheet={twinSprite(twin.avatar)} scale={3} />
        </div>
      </div>
      <div className="core-name">{twin.name}</div>
      <div className={`core-line ${pending ? 'warn' : ''}`}>Nükleer çekirdek · güç %{power} · {line}</div>
      <button className="core-talk" onClick={(e) => { e.stopPropagation(); onTalk(); }}><Icon name="chat" size={13} /> Konuş</button>
    </div>
  );
}

// ------------------------------------------------------------------ ekip odası

function Room({ s, team, box, index, focused, onFocus, onOpen }: { s: AppState; team: Team; box: Box; index: number; focused: boolean; onFocus: () => void; onOpen: () => void }) {
  const { members, waiting, busy, paused } = teamState(s, team);
  const theme = themeOf(team);
  const live = s.missions.filter((m) => m.status === 'running').map((m) => m.id);
  const tasks = s.tasks.filter((t) => live.includes(t.missionId) && members.some((m) => m.id === t.assigneeId) && t.parentId !== null);
  const progress = tasks.length ? tasks.reduce((n, t) => n + taskProgress(s, t), 0) / tasks.length : 0;
  const cols = Math.min(3, Math.max(1, members.length));
  const state = waiting ? 'Onay' : paused ? 'Beklemede' : busy ? 'Aktif' : 'Boşta';
  const decor = decorStrip(theme, team.color);
  const spent = members.reduce((n, a) => n + a.spent, 0);
  const ticker = 'ETSY ▲4.2% · BTC ▲1.1% · AMZN ▼0.6% · SHOP ▲2.8% · EBAY ▼0.3% · ETH ▲0.9% · ';

  return (
    <div
      className={`room theme-${theme} ${busy ? 'busy' : ''} ${waiting ? 'waiting' : ''} ${focused ? 'focused' : ''}`}
      style={{
        left: box.x, top: box.y, width: box.w, height: box.h, ['--tc' as string]: team.color,
        ['--wall' as string]: `url(${plating(darken(team.color, 0.7), index + 3)})`,
        ['--floor' as string]: `url(${floorTile(theme, team.color)})`,
      } as CSSProperties}
      onClick={onFocus}
    >
      <span className="beacon l" style={{ animationDelay: `${-index * 0.37}s` }} />
      <span className="beacon r" style={{ animationDelay: `${-index * 0.61 - 0.7}s` }} />
      <div className="room-h">
        <span className="room-no">{String(index + 1).padStart(2, '0')}</span>
        <span className="room-name"><TeamIcon icon={team.icon} size={14} /> {team.name}</span>
        <span className={`room-state ${waiting ? 'warn' : busy ? 'on' : ''}`}>{state}</span>
        <button className="room-term" title="Terminali aç" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
          <Icon name="layout" size={12} /> <span className="rt-lbl">Terminal</span>
        </button>
      </div>
      <div className="room-floor">
        <div className="room-wall" style={{ backgroundImage: `url(${decor.url})`, backgroundSize: `${decor.w * 3}px ${decor.h * 3}px` }}>
          {theme === 'dev' && <span className="leds" />}
          {theme === 'trade' && <span className="ticker"><span>{ticker}</span><span>{ticker}</span></span>}
          {theme === 'lab' && <span className="bubbles" />}
          <span className="theme-tag">{THEMES[theme].label}</span>
        </div>
        <div className="stations" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {members.map((a, i) => <Station key={a.id} s={s} a={a} i={i} />)}
          {members.length === 0 && <div className="dim" style={{ fontSize: 12 }}>Boş oda</div>}
        </div>
      </div>
      <div className="room-f">
        <span>{members.length} ajan</span>
        <span className="grow" />
        {team.boost && <span className="boost"><Icon name="zap" size={12} /> Hızlı</span>}
        <span className="rev" title="Ekibin Claude kullanımı">{money(spent)}</span>
      </div>
      <div className="room-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
    </div>
  );
}

const BUBBLE: Partial<Record<Agent['kind'], string>> = {
  research: '?', analyst: '%', writer: '✎', dev: '</>', qa: '✓', devops: '⚙', trader: '$', lead: '★', commander: '★', custom: '…',
};

function Station({ s, a, i }: { s: AppState; a: Agent; i: number }) {
  const selectAgent = useStore((x) => x.selectAgent);
  const st: AgentStatus = agentStatus(s, a.id);
  const act = currentActivity(s, a.id);
  const { lead } = agentLook(s, a);
  const working = st === 'working';
  return (
    <div className={`station st-${st}`} onClick={(e) => { e.stopPropagation(); if (!justDragged()) selectAgent(a.id); }}>
      <div
        className={`npc-wrap ${working ? 'work' : st === 'idle' ? 'idle' : ''}`}
        style={{ animationDelay: `${-(i * 0.9)}s`, ['--dx' as string]: `${(i % 2 ? -1 : 1) * 30}px` } as CSSProperties}
      >
        {st === 'waiting' && <span className="bubble warn">!</span>}
        {st === 'paused' && <span className="bubble z">z</span>}
        {(working || st === 'managing') && <span className="bubble talk">{st === 'managing' ? '★' : BUBBLE[a.kind] ?? '…'}</span>}
        <Npc sheet={sheetFor(s, a)} moving={working} />
      </div>
      {/* Masa karakterin önünde (bacaklarını örter); sunucu dolabı gibi uzun eşyalar yanda durur */}
      <div className={`prop-wrap ${a.kind === 'devops' && !lead ? 'side' : ''} ${st !== 'idle' && st !== 'paused' ? 'on' : ''}`}>
        <Prop sheet={station(a.kind, lead, a.color)} />
      </div>
      <div className="tag" style={{ borderColor: a.color }}>{a.name}</div>
      <div className="npc-tip">
        <b>{a.name}</b> <span className="dim">· {a.role}</span>
        <div>{act ? act.text : STATUS_LABEL[st]}</div>
      </div>
    </div>
  );
}

/** Üssün etrafında süzülen birkaç asteroit (sadece geniş ekranda). */
function Decor() {
  const rocks = [
    { x: 500, y: 140, s: 26, seed: 2, d: 0 },
    { x: 960, y: 560, s: 18, seed: 5, d: -3 },
    { x: 1330, y: 520, s: 34, seed: 9, d: -6 },
    { x: 360, y: 600, s: 16, seed: 13, d: -2 },
    { x: 960, y: 220, s: 14, seed: 17, d: -5 },
    { x: 140, y: 470, s: 22, seed: 21, d: -4 },
  ];
  return (
    <>
      {rocks.map((r) => (
        <img key={r.seed} className="rock" src={asteroid(r.s, r.seed)} alt="" style={{ left: r.x, top: r.y, width: r.s * 3, height: r.s * 3, animationDelay: `${r.d}s` }} />
      ))}
    </>
  );
}
