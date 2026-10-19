// Saf durum fonksiyonları: reduce (kullanıcı eylemleri) ve tick (simülasyonun bir adımı).
// Hem sunucuda çalışır hem de istemcide durum türetmek için kullanılır.

import { MODELS, RESULTS, layoutTree, stepsFor } from './meta.ts';
import { seedState } from './seed.ts';
import { NEW_CHAT_TITLE, chatOf, newChat, pushMessage, trimChats } from './chats.ts';
import { twinRespond, twinSay } from './twin.ts';
import type { Action, Agent, AppState, LogEntry, Mission, Task } from './types.ts';

const MAX_LOGS = 400;
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 10);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function log(s: AppState, e: Omit<LogEntry, 'id' | 'ts'>) {
  s.logs.push({ id: uid('l-'), ts: Date.now(), ...e });
  if (s.logs.length > MAX_LOGS) s.logs.splice(0, s.logs.length - MAX_LOGS);
}

/** id'nin altındaki tüm ajanlar (kendisi hariç). Döngü kontrolü için. */
export function descendants(s: AppState, id: string): Set<string> {
  const out = new Set<string>();
  const walk = (m: string) => {
    for (const a of s.agents) if (a.managerId === m && !out.has(a.id)) { out.add(a.id); walk(a.id); }
  };
  walk(id);
  return out;
}

export type AgentStatus = 'idle' | 'working' | 'managing' | 'waiting' | 'paused';

export function agentStatus(s: AppState, id: string): AgentStatus {
  const a = s.agents.find((x) => x.id === id);
  if (!a) return 'idle';
  if (a.paused) return 'paused';
  const live = new Set(s.missions.filter((m) => m.status === 'running').map((m) => m.id));
  const mine = s.tasks.filter((t) => t.assigneeId === id && live.has(t.missionId));
  if (mine.some((t) => t.status === 'waiting_approval')) return 'waiting';
  if (mine.some((t) => t.status === 'running' || t.status === 'planning' || t.status === 'pending')) return 'working';
  if (mine.some((t) => t.status === 'waiting_children')) return 'managing';
  return 'idle';
}

/** Ajanın şu an üzerinde olduğu iş (kart üzerinde gösterilir). */
export function currentActivity(s: AppState, id: string): { text: string; progress: number } | null {
  const live = new Set(s.missions.filter((m) => m.status === 'running' || m.status === 'paused').map((m) => m.id));
  const t = s.tasks.find(
    (t) => t.assigneeId === id && live.has(t.missionId) && t.status !== 'done' && t.status !== 'skipped',
  );
  if (!t) return null;
  if (t.status === 'waiting_children') {
    const kids = s.tasks.filter((k) => k.parentId === t.id);
    const done = kids.filter((k) => k.status === 'done' || k.status === 'skipped').length;
    return { text: `Ekibini yönetiyor (${done}/${kids.length})`, progress: kids.length ? done / kids.length : 0 };
  }
  if (t.status === 'waiting_approval') return { text: `Onay bekliyor: ${t.steps[t.stepIndex]?.text ?? ''}`, progress: t.stepIndex / Math.max(1, t.steps.length) };
  if (t.status === 'pending' || t.status === 'planning') return { text: 'Görevi planlıyor', progress: 0 };
  return { text: t.steps[t.stepIndex]?.text ?? t.title, progress: t.stepIndex / Math.max(1, t.steps.length) };
}

export function taskProgress(s: AppState, t: Task): number {
  if (t.status === 'done' || t.status === 'skipped') return 1;
  if (t.real && !s.tasks.some((k) => k.parentId === t.id)) {
    if (t.status === 'waiting_approval') return 0.95;
    return t.status === 'running' ? Math.min(0.9, 0.12 + t.steps.length * 0.06) : 0.05;
  }
  const kids = s.tasks.filter((k) => k.parentId === t.id);
  if (kids.length) return kids.reduce((sum, k) => sum + taskProgress(s, k), 0) / kids.length * 0.95;
  return t.steps.length ? t.stepIndex / t.steps.length : 0;
}

// ---------------------------------------------------------------- reduce

export function reduce(prev: AppState, action: Action): AppState {
  if (action.type === 'demo/reset') return seedState();
  const s: AppState = structuredClone(prev);
  const agent = (id: string) => s.agents.find((a) => a.id === id);

  switch (action.type) {
    case 'agent/add':
      s.agents.push(action.agent);
      log(s, { type: 'system', agentId: action.agent.id, text: `${action.agent.name} orduya katıldı` });
      break;

    case 'agent/update': {
      const a = agent(action.id);
      if (!a) break;
      const { managerId, id: _id, ...rest } = action.patch;
      Object.assign(a, rest);
      if (managerId !== undefined) setManager(s, a, managerId);
      if (rest.paused === false && a.budget > 0 && a.spent >= a.budget) a.budget = Math.ceil(a.spent + 5);
      break;
    }

    case 'agent/delete': {
      const a = agent(action.id);
      if (!a) break;
      for (const r of s.agents) if (r.managerId === a.id) r.managerId = a.managerId;
      s.agents = s.agents.filter((x) => x.id !== a.id);
      for (const t of s.tasks) if (t.assigneeId === a.id && t.status !== 'done') t.status = 'skipped';
      log(s, { type: 'system', text: `${a.name} ordudan çıkarıldı` });
      break;
    }

    case 'agent/setManager': {
      const a = agent(action.id);
      if (a) setManager(s, a, action.managerId);
      break;
    }

    case 'agent/move':
      for (const p of action.positions) {
        const a = agent(p.id);
        if (a) { a.x = Math.round(p.x); a.y = Math.round(p.y); }
      }
      break;

    case 'agent/layout':
      layoutTree(s);
      break;

    case 'team/add':
      s.teams.push(action.team);
      log(s, { type: 'system', text: `${action.team.name} takımı kuruldu` });
      break;

    case 'team/update': {
      const t = s.teams.find((x) => x.id === action.id);
      if (t) Object.assign(t, action.patch);
      if (t && action.patch.color) for (const a of s.agents) if (a.teamId === t.id) a.color = t.color;
      break;
    }

    case 'team/delete':
      s.teams = s.teams.filter((t) => t.id !== action.id);
      for (const a of s.agents) if (a.teamId === action.id) a.teamId = null;
      break;

    case 'mission/create': {
      const owner = agent(action.mission.ownerId);
      if (!owner) break;
      const m: Mission = { ...action.mission, status: 'running', createdAt: Date.now() };
      startMission(s, m, newTask(m, null, owner, m.title));
      break;
    }

    case 'chat/send': {
      const text = action.text.trim().slice(0, 4000);
      const attachments = action.attachments?.slice(0, 10);
      if (!text && !attachments?.length) break;
      const chat = chatOf(s, action.chatId);
      pushMessage(chat, { id: action.id, ts: Date.now(), from: 'user', text, attachments, voice: action.voice || undefined });
      // Gerçek modda cevabı sunucu yapay zekâ sağlayıcısından alır (server/runner.ts).
      if (s.mode === 'real') chat.busy = true;
      else if (text) twinRespond(s, text, startMission, (m, ownerId) => newTask(m, null, agent(ownerId)!, m.title));
      if (s.mode !== 'real' && attachments?.length) twinSay(s, 'Ekleri aldım. Görselleri ve dosyaları inceleyebilmem için üstten Gerçek moda geçmen gerekiyor.');
      break;
    }

    case 'grant/add':
      // Yol, sunucuda (server/index.ts) var olan bir klasör olarak doğrulanmış gelir.
      s.grants = s.grants.filter((g) => g.path !== action.grant.path);
      s.grants.push(action.grant);
      log(s, { type: 'system', text: `Klasör erişimi verildi (${action.grant.mode === 'write' ? 'okuma + yazma' : 'sadece okuma'}): ${action.grant.path}` });
      break;

    case 'grant/remove': {
      const g = s.grants.find((x) => x.id === action.id);
      s.grants = s.grants.filter((x) => x.id !== action.id);
      if (g) log(s, { type: 'system', text: `Klasör erişimi kaldırıldı: ${g.path}` });
      break;
    }

    case 'mode/set':
      s.mode = action.mode;
      log(s, { type: 'system', text: action.mode === 'real' ? 'GERÇEK MOD: ajanlar artık Claude ile çalışıyor' : 'SİMÜLASYON MODU' });
      break;

    case 'chat/new':
      if (!s.chats.some((c) => c.id === action.id)) s.chats.push(newChat(action.id));
      trimChats(s);
      break;

    case 'chat/rename': {
      const c = s.chats.find((x) => x.id === action.id);
      if (c) c.title = action.title.replace(/\s+/g, ' ').trim().slice(0, 40) || NEW_CHAT_TITLE;
      break;
    }

    case 'chat/delete':
      s.chats = s.chats.filter((c) => c.id !== action.id);
      if (!s.chats.length) s.chats.push(newChat(uid('k-')));
      break;

    case 'chat/clear': {
      const c = s.chats.find((x) => x.id === action.id);
      if (c) { c.messages = []; c.busy = false; }
      break;
    }

    case 'team/pause':
      for (const a of s.agents) if (a.teamId === action.id) a.paused = action.paused;
      log(s, { type: 'system', text: `${s.teams.find((t) => t.id === action.id)?.name ?? 'Ekip'} ${action.paused ? 'beklemeye alındı' : 'yeniden çalışıyor'}` });
      break;

    case 'mission/setStatus': {
      const m = s.missions.find((x) => x.id === action.id);
      if (!m || m.status === 'done' || m.status === 'cancelled') break;
      m.status = action.status;
      if (action.status === 'cancelled') {
        m.finishedAt = Date.now();
        for (const t of s.tasks) if (t.missionId === m.id && t.status !== 'done') t.status = 'skipped';
        for (const ap of s.approvals) if (ap.missionId === m.id && ap.status === 'pending') ap.status = 'rejected';
      }
      const verb = { running: 'devam ediyor', paused: 'duraklatıldı', cancelled: 'iptal edildi' }[action.status];
      log(s, { type: 'system', missionId: m.id, text: `"${m.title}" ${verb}` });
      break;
    }

    case 'mission/delete':
      s.missions = s.missions.filter((m) => m.id !== action.id);
      s.tasks = s.tasks.filter((t) => t.missionId !== action.id);
      s.approvals = s.approvals.filter((a) => a.missionId !== action.id || a.status !== 'pending');
      break;

    case 'approval/resolve': {
      const ap = s.approvals.find((x) => x.id === action.id);
      if (!ap || ap.status !== 'pending') break;
      ap.status = action.approved ? 'approved' : 'rejected';
      const a = agent(ap.agentId);
      log(s, {
        type: 'approval',
        agentId: ap.agentId,
        missionId: ap.missionId,
        text: `${action.approved ? '✅ Onaylandı' : '⛔ Reddedildi'}: ${a?.name ?? 'Ajan'} — ${ap.action}`,
      });
      break;
    }

    case 'sim/set':
      if (action.running !== undefined) s.sim.running = action.running;
      if (action.speed !== undefined) s.sim.speed = Math.min(8, Math.max(0.5, action.speed));
      break;

    case 'logs/clear':
      s.logs = [];
      break;
  }
  return s;
}

function setManager(s: AppState, a: Agent, managerId: string | null) {
  if (managerId === a.id) return;
  if (managerId && descendants(s, a.id).has(managerId)) return; // döngü olmasın
  if (managerId && !s.agents.some((x) => x.id === managerId)) return;
  a.managerId = managerId;
  const m = managerId ? s.agents.find((x) => x.id === managerId) : null;
  log(s, { type: 'system', agentId: a.id, text: m ? `${a.name} artık ${m.name}'a bağlı` : `${a.name} bağımsız çalışıyor` });
}

export function startMission(s: AppState, m: Mission, root: Task) {
  m.real = s.mode === 'real';
  root.real = m.real;
  s.missions.push(m);
  s.tasks.push(root);
  const owner = s.agents.find((a) => a.id === root.assigneeId);
  log(s, { type: 'info', missionId: m.id, toAgentId: root.assigneeId, text: `Yeni görev → ${owner?.name ?? '?'}: "${m.title}"` });
}

export function newTask(m: Mission, parentId: string | null, a: Agent, title: string): Task {
  return { id: uid('k-'), missionId: m.id, parentId, assigneeId: a.id, title, status: 'pending', steps: [], stepIndex: 0, real: m.real };
}

export { log };

// ---------------------------------------------------------------- tick

export function tick(prev: AppState): AppState {
  if (!prev.sim.running) return prev;
  const active = prev.missions.filter((m) => m.status === 'running' && !m.real);
  if (!active.length) return prev;

  const s: AppState = structuredClone(prev);
  const agent = (id: string) => s.agents.find((a) => a.id === id);
  const working = new Set<string>();

  for (const m of s.missions.filter((m) => m.status === 'running' && !m.real)) {
    // Bu turda oluşturulan görevler bir sonraki tura kalsın diye kopya üzerinde dön.
    for (const t of s.tasks.filter((t) => t.missionId === m.id)) {
      const a = agent(t.assigneeId);
      if (!a) { if (t.status !== 'done') t.status = 'skipped'; continue; }
      if (a.paused || t.status === 'done' || t.status === 'skipped') continue;
      const boosted = !!a.teamId && s.teams.find((x) => x.id === a.teamId)?.boost;
      if (!boosted && t.status !== 'waiting_children' && t.status !== 'waiting_approval' && Math.random() > 0.72) { working.add(a.id); continue; }

      switch (t.status) {
        case 'pending':
          t.status = 'planning';
          working.add(a.id);
          log(s, { type: 'info', agentId: a.id, missionId: m.id, text: `${a.name} görevi aldı: "${t.title}"` });
          break;

        case 'planning': {
          working.add(a.id);
          let reports = s.agents.filter((r) => r.managerId === a.id && !r.paused);
          if (t.parentId === null && m.targets?.length) {
            const only = reports.filter((r) => m.targets!.includes(r.id));
            if (only.length) reports = only;
          }
          if (reports.length) {
            for (const r of reports) {
              const team = r.teamId ? s.teams.find((x) => x.id === r.teamId) : null;
              const title = (a.kind === 'commander' || a.kind === 'twin') && team ? `${m.title} — ${team.name}` : `${m.title} · ${r.role}`;
              s.tasks.push(newTask(m, t.id, r, title));
              log(s, { type: 'delegate', agentId: a.id, toAgentId: r.id, missionId: m.id, text: `${a.name} → ${r.name}: "${title}"` });
            }
            t.status = 'waiting_children';
          } else {
            t.steps = stepsFor(a.kind, m.title);
            t.stepIndex = 0;
            t.status = 'running';
          }
          break;
        }

        case 'running': {
          working.add(a.id);
          const step = t.steps[t.stepIndex];
          if (!step) { finish(s, t, a); break; }
          if (step.risky && a.autonomy === 'readonly') {
            log(s, { type: 'info', agentId: a.id, missionId: m.id, text: `${a.name} (salt okunur) yalnızca önerdi: ${step.text}` });
            t.stepIndex++;
          } else if (step.risky && a.autonomy === 'ask') {
            const id = uid('p-');
            s.approvals.push({ id, ts: Date.now(), agentId: a.id, missionId: m.id, taskId: t.id, action: step.text, tool: step.tool, amount: step.amount, status: 'pending' });
            t.approvalId = id;
            t.status = 'waiting_approval';
            log(s, { type: 'approval', agentId: a.id, missionId: m.id, text: `${a.name} onay istiyor: ${step.text}` });
            twinSay(s, `${a.name} şunu yapmak istiyor: ${step.text}. Onay veriyor musun?`, {
              missionId: m.id,
              approvalId: id,
            });
          } else {
            log(s, { type: 'tool', agentId: a.id, missionId: m.id, text: `${step.tool ? `[${step.tool}] ` : ''}${step.text}` });
            t.stepIndex++;
          }
          if (t.stepIndex >= t.steps.length && t.status === 'running') finish(s, t, a);
          break;
        }

        case 'waiting_approval': {
          const ap = s.approvals.find((x) => x.id === t.approvalId);
          if (!ap || ap.status === 'pending') break;
          const step = t.steps[t.stepIndex];
          if (ap.status === 'approved') log(s, { type: 'tool', agentId: a.id, missionId: m.id, text: `${step?.tool ? `[${step.tool}] ` : ''}${step?.text ?? ''} ✔` });
          else log(s, { type: 'info', agentId: a.id, missionId: m.id, text: `${a.name} adımı atladı (reddedildi)` });
          t.stepIndex++;
          t.approvalId = undefined;
          t.status = 'running';
          if (t.stepIndex >= t.steps.length) finish(s, t, a);
          break;
        }

        case 'waiting_children': {
          const kids = s.tasks.filter((k) => k.parentId === t.id);
          if (kids.every((k) => k.status === 'done' || k.status === 'skipped')) finish(s, t, a);
          break;
        }
      }
    }

    const root = s.tasks.find((t) => t.missionId === m.id && t.parentId === null);
    if (!root || root.status === 'done' || root.status === 'skipped') {
      m.status = 'done';
      m.finishedAt = Date.now();
      log(s, { type: 'result', missionId: m.id, text: `🏁 Görev tamamlandı: "${m.title}"` });
      const kids = s.tasks.filter((k) => k.missionId === m.id && k.status === 'done' && k.parentId !== null && !s.tasks.some((c) => c.parentId === k.id));
      const lines = kids.slice(0, 8).map((k) => `• ${agent(k.assigneeId)?.name ?? '?'}: ${k.result}`);
      twinSay(s, `✅ "${m.title}" bitti.\n${lines.join('\n')}`, { missionId: m.id });
    }
  }

  // Maliyet & bütçe
  for (const id of working) {
    const a = agent(id);
    if (!a) continue;
    const model = MODELS[a.model];
    const mult = a.teamId && s.teams.find((x) => x.id === a.teamId)?.boost ? 1.6 : 1;
    a.spent = +(a.spent + model.costPerTick * mult * (0.6 + Math.random() * 0.8)).toFixed(4);
    a.tokens += Math.round(model.tokensPerTick * (0.6 + Math.random() * 0.8));
    if (a.budget > 0 && a.spent >= a.budget && !a.paused) {
      a.paused = true;
      log(s, { type: 'error', agentId: a.id, text: `${a.name} bütçe limitine ($${a.budget}) ulaştı ve durduruldu` });
    }
  }
  return s;
}

function finish(s: AppState, t: Task, a: Agent) {
  t.status = 'done';
  t.result = pick(RESULTS[a.kind]);
  // Simülasyon: onaylanan alımlar %20-50 kârla satılır, ekip gelirine yazılır.
  const bought = s.approvals.filter((p) => p.taskId === t.id && p.status === 'approved' && p.amount !== undefined);
  const team = a.teamId ? s.teams.find((x) => x.id === a.teamId) : null;
  if (bought.length && team) {
    const profit = +bought.reduce((n, p) => n + p.amount! * (0.2 + Math.random() * 0.3), 0).toFixed(2);
    team.revenue = +((team.revenue ?? 0) + profit).toFixed(2);
    t.result = `Satış tamam, kâr $${profit}`;
  }
  log(s, { type: 'result', agentId: a.id, missionId: t.missionId, text: `${a.name}: ${t.result}` });
}
