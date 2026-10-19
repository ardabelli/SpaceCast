import { uid } from '../shared/engine.ts';
import type { Agent } from '../shared/types.ts';
import { useStore } from './store.ts';

const NAMES = ['Nova', 'Orbit', 'Vega', 'Kıvılcım', 'Rota', 'Sinyal', 'Mercek', 'Pusula', 'Yankı', 'Çekirdek', 'Fener', 'Kuzgun'];
const EMOJIS = ['🤖', '🛸', '🦉', '🐺', '🦾', '🧩', '🔮', '🐝', '🦈', '🧿'];

/** Yeni ajan oluşturur ve düzenleme panelini açar. */
export function createAgent(opts: { teamId?: string | null; managerId?: string | null; x?: number; y?: number } = {}) {
  const { state, dispatch, selectAgent } = useStore.getState();
  if (!state) return;
  const team = opts.teamId ? state.teams.find((t) => t.id === opts.teamId) : null;
  const used = new Set(state.agents.map((a) => a.name));
  const name = NAMES.find((n) => !used.has(n)) ?? `Ajan ${state.agents.length + 1}`;
  const manager = opts.managerId ? state.agents.find((a) => a.id === opts.managerId) : null;
  const agent: Agent = {
    id: uid('a-'),
    name,
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    color: team?.color ?? '#7c6cff',
    role: 'Yeni ajan',
    kind: 'custom',
    model: 'claude-sonnet-5-5',
    teamId: team?.id ?? null,
    managerId: manager?.id ?? null,
    autonomy: 'ask',
    tools: ['web_search'],
    systemPrompt: '',
    budget: 0,
    spent: 0,
    tokens: 0,
    paused: false,
    x: opts.x ?? (manager ? manager.x : 0),
    y: opts.y ?? (manager ? manager.y + 210 : -220),
  };
  dispatch({ type: 'agent/add', agent });
  selectAgent(agent.id);
}
