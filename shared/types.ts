// Uygulamanın tüm durumu. Sunucu tutar, istemciler WebSocket ile kopyasını alır.

import type { PublicSettings, SystemInfo } from './providers.ts';

export type AgentKind =
  | 'twin'
  | 'commander'
  | 'lead'
  | 'dev'
  | 'qa'
  | 'devops'
  | 'research'
  | 'analyst'
  | 'trader'
  | 'writer'
  | 'custom';

export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

/** full: her şeyi kendi yapar · ask: riskli işlemlerde onay ister · readonly: sadece okur/raporlar */
export type Autonomy = 'full' | 'ask' | 'readonly';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  kind: AgentKind;
  model: ModelId;
  teamId: string | null;
  managerId: string | null;
  autonomy: Autonomy;
  tools: string[];
  systemPrompt: string;
  /** USD cinsinden harcama limiti, 0 = limitsiz */
  budget: number;
  spent: number;
  tokens: number;
  paused: boolean;
  /** Düşünme seviyesi; 'auto' ya da boş = rolüne göre önerilen */
  effort?: Effort;
  x: number;
  y: number;
}

export type Effort = 'auto' | 'low' | 'medium' | 'high';

export interface Team {
  id: string;
  name: string;
  icon: string;
  color: string;
  goal: string;
  /** Simüle edilen toplam kazanç ($) */
  revenue: number;
  /** HIZLANDIR: ekip her turda ilerler, maliyet artar */
  boost: boolean;
  /** Odanın görünümü; boşsa ikondan tahmin edilir */
  theme?: TeamTheme;
}

export type TeamTheme = 'lab' | 'dev' | 'trade' | 'ops';

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'waiting_children'
  | 'waiting_approval'
  | 'done'
  | 'skipped';

export interface Step {
  text: string;
  tool?: string;
  risky?: boolean;
  amount?: number;
}

export interface Task {
  id: string;
  missionId: string;
  parentId: string | null;
  assigneeId: string;
  title: string;
  status: TaskStatus;
  steps: Step[];
  stepIndex: number;
  approvalId?: string;
  result?: string;
  /** Yöneticinin bu göreve özel talimatı (gerçek mod) */
  brief?: string;
  /** Gerçek modda Claude ile çalışan görev */
  real?: boolean;
  /** Aşama: kardeş görevlerden daha düşük aşamadakiler bitmeden başlamaz */
  stage?: number;
}

export type MissionStatus = 'running' | 'paused' | 'done' | 'cancelled';

export interface Mission {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  /** Sahibi sadece bu ast ajanlara dağıtır (boşsa hepsine) */
  targets?: string[];
  /** Gerçek mod: ajanlar Claude Code ile çalışır */
  real?: boolean;
  /** Gerçek modda ajanların dosya yazdığı klasör */
  workspace?: string;
  /** Görevi doğuran mesajlardaki ekler (çalışma klasörüne kopyalanır) */
  attachments?: Attachment[];
  /** Görevin açıldığı sohbet: rapor ve onay soruları buraya düşer */
  chatId?: string;
  status: MissionStatus;
  createdAt: number;
  finishedAt?: number;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  ts: number;
  agentId: string;
  missionId: string;
  taskId: string;
  action: string;
  tool?: string;
  amount?: number;
  status: ApprovalStatus;
}

export type LogType = 'info' | 'delegate' | 'tool' | 'result' | 'approval' | 'error' | 'system';

export interface LogEntry {
  id: string;
  ts: number;
  type: LogType;
  agentId?: string;
  toAgentId?: string;
  missionId?: string;
  text: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Sunucudaki mutlak dosya yolu */
  path: string;
}

/** Kullanıcının ikize ve ajanlara açtığı klasör */
export interface Grant {
  id: string;
  path: string;
  mode: 'read' | 'write';
}

export interface ChatMsg {
  id: string;
  ts: number;
  from: 'user' | 'twin';
  text: string;
  missionId?: string;
  approvalId?: string;
  attachments?: Attachment[];
  /** Kullanıcı bu mesajı sesle söyledi */
  voice?: boolean;
}

/** İkizle ayrı bir sohbet (sekme). */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
  /** İkiz bu sohbette cevap hazırlıyor */
  busy?: boolean;
}

export interface AppState {
  version: number;
  agents: Agent[];
  teams: Team[];
  missions: Mission[];
  tasks: Task[];
  approvals: Approval[];
  logs: LogEntry[];
  chats: Conversation[];
  grants: Grant[];
  sim: { running: boolean; speed: number };
  /** sim: taklit · real: Claude Code ile gerçek ajanlar */
  mode: 'sim' | 'real';
}

export type Action =
  | { type: 'agent/add'; agent: Agent }
  | { type: 'agent/update'; id: string; patch: Partial<Agent> }
  | { type: 'agent/delete'; id: string }
  | { type: 'agent/setManager'; id: string; managerId: string | null }
  | { type: 'agent/move'; positions: { id: string; x: number; y: number }[] }
  | { type: 'agent/layout' }
  | { type: 'team/add'; team: Team }
  | { type: 'team/update'; id: string; patch: Partial<Team> }
  | { type: 'team/delete'; id: string }
  | { type: 'team/pause'; id: string; paused: boolean }
  | { type: 'mission/create'; mission: { id: string; title: string; description: string; ownerId: string; targets?: string[] } }
  | { type: 'mission/setStatus'; id: string; status: 'running' | 'paused' | 'cancelled' }
  | { type: 'mission/delete'; id: string }
  | { type: 'approval/resolve'; id: string; approved: boolean }
  | { type: 'sim/set'; running?: boolean; speed?: number }
  | { type: 'mode/set'; mode: 'sim' | 'real' }
  | { type: 'logs/clear' }
  | { type: 'chat/send'; id: string; chatId?: string; text: string; attachments?: Attachment[]; voice?: boolean }
  | { type: 'chat/new'; id: string }
  | { type: 'chat/rename'; id: string; title: string }
  | { type: 'chat/delete'; id: string }
  | { type: 'grant/add'; grant: Grant }
  | { type: 'grant/remove'; id: string }
  | { type: 'chat/clear'; id: string }
  | { type: 'demo/reset' };

/** Sunucu → istemci mesajları */
export type ServerMsg =
  | { type: 'state'; state: AppState }
  | { type: 'hello'; lanUrls: string[]; claude: ClaudeInfo; home: string; secureUrl?: string; settings: PublicSettings; system: SystemInfo; local: boolean }
  | { type: 'settings'; settings: PublicSettings; system: SystemInfo }
  | { type: 'error'; message: string };

/** İstemci → sunucu mesajları */
export type ClientMsg = { type: 'action'; action: Action };

export interface ClaudeInfo {
  installed: boolean;
  loggedIn: boolean;
  version?: string;
  account?: string;
}
