import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import { Icon, TeamIcon } from '../icons.tsx';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentStatus, currentActivity } from '../../shared/engine.ts';
import { MODELS, NODE_H, NODE_W } from '../../shared/meta.ts';
import type { Team } from '../../shared/types.ts';
import { createAgent } from '../actions.ts';
import { useAppState, useStore } from '../store.ts';
import { Avatar, Bar, STATUS_LABEL, modelLabel } from '../ui.tsx';

type XY = { x: number; y: number };
type AgentNodeT = Node<{ id: string }, 'agent'>;
type TeamNodeT = Node<{ team: Team }, 'team'>;

const PAD = 26;
const LABEL = 34;

const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentNodeT>) {
  const s = useAppState();
  const settings = useStore((x) => x.settings);
  const a = s.agents.find((x) => x.id === data.id);
  if (!a) return null;
  const st = agentStatus(s, a.id);
  const act = currentActivity(s, a.id);
  const reports = s.agents.filter((r) => r.managerId === a.id).length;
  return (
    <div className={`anode ${st} ${a.kind === 'twin' ? 'twin' : ''} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="row">
        <Avatar agent={a} status={st} />
        <div className="grow">
          <div className="name ellipsis">{a.name}</div>
          <div className="role ellipsis">{a.role}</div>
        </div>
        <span className="badge" title={modelLabel(a.model, settings)}>{modelLabel(a.model, settings, true)}</span>
      </div>
      <div className="act ellipsis">{act ? act.text : STATUS_LABEL[st]}</div>
      <div className="row">
        <div className="grow"><Bar value={act?.progress ?? 0} /></div>
        {reports > 0 && <span className="dim row" style={{ fontSize: 11.5, gap: 3 }}><Icon name="users" size={12} /> {reports}</span>}
        {a.autonomy === 'ask' && <span className="dim" title="Riskli işlemlerde onay ister"><Icon name="lock" size={12} /></span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

function TeamNode({ data }: NodeProps<TeamNodeT>) {
  return (
    <div className="team-box" style={{ ['--tc' as string]: data.team.color }}>
      <div className="lbl"><TeamIcon icon={data.team.icon} size={15} /> {data.team.name}</div>
    </div>
  );
}

const nodeTypes = { agent: AgentNode, team: TeamNode };

function teamBoxes(teams: Team[], members: { teamId: string | null; x: number; y: number }[]) {
  const out: { team: Team; x: number; y: number; w: number; h: number }[] = [];
  for (const team of teams) {
    const ms = members.filter((m) => m.teamId === team.id);
    if (!ms.length) continue;
    const x0 = Math.min(...ms.map((m) => m.x)) - PAD;
    const y0 = Math.min(...ms.map((m) => m.y)) - PAD - LABEL;
    const x1 = Math.max(...ms.map((m) => m.x)) + NODE_W + PAD;
    const y1 = Math.max(...ms.map((m) => m.y)) + NODE_H + PAD;
    out.push({ team, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

function Canvas() {
  const s = useAppState();
  const { dispatch, selectAgent, selectedAgentId } = useStore();
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  // Sürükleme sırasında konumlar yerelde tutulur, bırakınca sunucuya yazılır.
  const [overrides, setOverrides] = useState<Record<string, XY>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const pos = useCallback((a: { id: string; x: number; y: number }) => overrides[a.id] ?? { x: a.x, y: a.y }, [overrides]);

  // Sunucu yeni konumu onayladıysa yerel kopyayı bırak.
  useEffect(() => {
    const stale = Object.keys(overrides).filter((id) => {
      const a = s.agents.find((x) => x.id === id);
      return !a || (a.x === Math.round(overrides[id].x) && a.y === Math.round(overrides[id].y));
    });
    if (stale.length) setOverrides((o) => { const n = { ...o }; for (const id of stale) delete n[id]; return n; });
  }, [s.agents, overrides]);

  const nodes = useMemo<Node[]>(() => {
    const placed = s.agents.map((a) => ({ ...a, ...pos(a) }));
    const boxes: TeamNodeT[] = teamBoxes(s.teams, placed).map((b) => ({
      id: `team-${b.team.id}`,
      type: 'team',
      position: { x: b.x, y: b.y },
      data: { team: b.team },
      style: { width: b.w, height: b.h },
      draggable: false,
      selectable: false,
      deletable: false,
      zIndex: -1,
    }));
    const agents: AgentNodeT[] = placed.map((a) => ({
      id: a.id,
      type: 'agent',
      position: { x: a.x, y: a.y },
      data: { id: a.id },
      selected: picked.has(a.id) || a.id === selectedAgentId,
      deletable: false,
    }));
    return [...boxes, ...agents];
  }, [s.agents, s.teams, pos, picked, selectedAgentId]);

  const edges = useMemo<Edge[]>(() => {
    const busy = (id: string) => {
      const st = agentStatus(s, id);
      return st === 'working' || st === 'waiting' || st === 'managing';
    };
    return s.agents
      .filter((a) => a.managerId && s.agents.some((m) => m.id === a.managerId))
      .map((a) => {
        const active = busy(a.id) && agentStatus(s, a.managerId!) === 'managing';
        return {
          id: `e-${a.id}`,
          source: a.managerId!,
          target: a.id,
          type: 'smoothstep',
          animated: active,
          className: active ? 'active' : '',
        };
      });
  }, [s]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moved: Record<string, XY> = {};
    const sel = new Set(picked);
    for (const c of changes) {
      if (c.type === 'position' && c.position) moved[c.id] = c.position;
      if (c.type === 'select' && !c.id.startsWith('team-')) {
        if (c.selected) sel.add(c.id); else sel.delete(c.id);
      }
    }
    if (Object.keys(moved).length) setOverrides((o) => ({ ...o, ...moved }));
    if (sel.size !== picked.size || [...sel].some((id) => !picked.has(id))) setPicked(sel);
  }, [picked]);

  const onNodeDragStop = useCallback((_: unknown, _node: Node, dragged: Node[]) => {
    const ids = new Set(dragged.map((n) => n.id));
    const positions = dragged.filter((n) => n.type === 'agent').map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }));
    if (!positions.length) return;
    dispatch({ type: 'agent/move', positions });

    // Başka bir takımın kutusuna bırakıldıysa o takıma kat.
    const others = s.agents.filter((a) => !ids.has(a.id));
    const boxes = teamBoxes(s.teams, others);
    for (const p of positions) {
      const cx = p.x + NODE_W / 2;
      const cy = p.y + NODE_H / 2;
      const hit = boxes.find((b) => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h);
      const a = s.agents.find((x) => x.id === p.id);
      if (hit && a && a.teamId !== hit.team.id) {
        dispatch({ type: 'agent/update', id: a.id, patch: { teamId: hit.team.id, color: hit.team.color } });
      }
    }
  }, [dispatch, s.agents, s.teams]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type === 'remove') dispatch({ type: 'agent/setManager', id: c.id.slice(2), managerId: null });
    }
  }, [dispatch]);

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) dispatch({ type: 'agent/setManager', id: c.target, managerId: c.source });
  }, [dispatch]);

  const addAtCenter = () => {
    const r = wrapper.current?.getBoundingClientRect();
    const p = r ? flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    createAgent({ x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - NODE_H / 2) });
  };

  return (
    <div ref={wrapper} style={{ position: 'absolute', inset: 0 }}>
      <div className="map-toolbar">
        <button className="btn sm" onClick={addAtCenter}>+ Ajan</button>
        <button
          className="btn sm"
          onClick={() => {
            dispatch({ type: 'agent/layout' });
            setTimeout(() => flow.fitView({ duration: 400, padding: 0.15 }), 150);
          }}
        >
          <Icon name="layout" size={14} /> Otomatik diz
        </button>
        <button className="btn sm" onClick={() => flow.fitView({ duration: 400, padding: 0.15 })}><Icon name="expand" size={14} /> Sığdır</button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, n) => n.type === 'agent' && selectAgent(n.id)}
        isValidConnection={(c) => c.source !== c.target}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
        maxZoom={1.6}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Lines} gap={24} color="rgba(255,255,255,0.035)" />
        <Controls showInteractive={false} position="top-right" />
        <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'team' ? 'transparent' : '#4a525e')} maskColor="rgba(12,14,17,.75)" />
      </ReactFlow>
      <div className="map-hint">
        Alt noktadan başka ajanın üst noktasına sürükle → <b>yönetici yap</b> · Bağlantıyı seç + Delete → <b>ayır</b> · Takım kutusuna bırak → <b>takıma kat</b>
      </div>
    </div>
  );
}

export function MapView() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
