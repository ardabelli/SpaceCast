import { create } from 'zustand';
import type { PublicSettings, SystemInfo } from '../shared/providers.ts';
import { TWIN_ID } from '../shared/seed.ts';
import type { Action, AppState, ClaudeInfo, ServerMsg } from '../shared/types.ts';

export type View = 'base' | 'twin' | 'map' | 'teams' | 'missions' | 'approvals' | 'logs';
const VIEWS: View[] = ['base', 'twin', 'map', 'teams', 'missions', 'approvals', 'logs'];

interface Store {
  state: AppState | null;
  connected: boolean;
  everConnected: boolean;
  lanUrls: string[];
  claude: ClaudeInfo | null;
  home: string;
  secureUrl: string | null;
  settings: PublicSettings | null;
  system: SystemInfo | null;
  /** Bu sayfa SpaceCast'in çalıştığı bilgisayarda mı açık */
  local: boolean;
  /** Uzaktan bağlanılıyor ve erişim kodu yok/yanlış */
  needsKey: boolean;
  toast: string | null;
  view: View;
  selectedAgentId: string | null;
  selectedMissionId: string | null;
  modal: null | { kind: 'mission'; ownerId?: string } | { kind: 'team'; teamId?: string } | { kind: 'connect' } | { kind: 'access' } | { kind: 'settings' };
  dispatch: (a: Action) => void;
  go: (v: View) => void;
  selectAgent: (id: string | null) => void;
  selectMission: (id: string | null) => void;
  openModal: (m: Store['modal']) => void;
}

const KEY_STORAGE = 'army-key';

/**
 * Erişim anahtarı adreste (?key=) kalır: iPhone'da "Ana Ekrana Ekle" o anki adresi kaydeder ve ana ekran
 * uygulaması Safari'nin hafızasını görmez. Anahtar silinseydi ana ekrandaki uygulama bağlanamazdı.
 */
function readKey(): string {
  const params = new URLSearchParams(location.search);
  let key = params.get('key') ?? '';
  if (key) {
    try { localStorage.setItem(KEY_STORAGE, key); } catch { /* özel pencere */ }
  } else {
    try { key = localStorage.getItem(KEY_STORAGE) ?? ''; } catch { key = ''; }
    if (key) {
      params.set('key', key);
      history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
    }
  }
  // Android/Chrome ana ekran uygulaması manifestteki başlangıç adresini açar: anahtarı oraya da koy
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link && key) link.href = `/manifest.webmanifest?key=${encodeURIComponent(key)}`;
  return key;
}

export function setKey(key: string) {
  try { localStorage.setItem(KEY_STORAGE, key); } catch { /* yok say */ }
  location.reload();
}

let socket: WebSocket | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string) {
  useStore.setState({ toast: text });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useStore.setState({ toast: null }), 4500);
}

/** Sunucuya erişim anahtarı (dosya yükleme ve görsel bağlantıları için). */
export function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) ?? ''; } catch { return ''; }
}

export function fileUrl(id: string) {
  const k = getKey();
  return `/api/file/${id}${k ? `?key=${encodeURIComponent(k)}` : ''}`;
}
const queue: string[] = [];

export const useStore = create<Store>((set, get) => ({
  state: null,
  connected: false,
  everConnected: false,
  lanUrls: [],
  claude: null,
  home: '',
  secureUrl: null,
  settings: null,
  system: null,
  local: false,
  needsKey: false,
  toast: null,
  view: VIEWS.includes(location.hash.slice(1) as View) ? (location.hash.slice(1) as View) : 'base',
  selectedAgentId: null,
  selectedMissionId: null,
  modal: null,
  dispatch: (action) => {
    const msg = JSON.stringify({ type: 'action', action });
    if (socket?.readyState === WebSocket.OPEN) socket.send(msg);
    else queue.push(msg);
  },
  go: (view) => {
    history.replaceState(null, '', `${location.pathname}${location.search}#${view}`);
    set({ view });
  },
  selectAgent: (id) => set({ selectedAgentId: id }),
  selectMission: (id) => set({ selectedMissionId: id }),
  openModal: (modal) => set({ modal }),
}));

/** Sunucu API çağrısı (erişim anahtarıyla). Hata durumunda sunucunun mesajını fırlatır. */
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-key': getKey() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Sunucu hatası (${r.status})`);
  return j as T;
}

/** İkizin kurulumda verilen adı. */
export function useTwinName() {
  return useStore((s) => s.state?.agents.find((a) => a.id === TWIN_ID)?.name ?? s.settings?.twinName ?? 'İkiz');
}

export function connect() {
  const key = readKey();
  let retry = 500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = async () => {
    // Uzaktan gelen ve anahtarı olmayan cihaza giriş ekranı göster
    try {
      const r = await fetch('/api/ping', { headers: { 'x-key': key } });
      if (r.status === 401) { useStore.setState({ needsKey: true }); return; }
    } catch { /* sunucu kapalı: aşağıda yeniden denenir */ }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?key=${encodeURIComponent(key)}`);
    socket = ws;
    ws.onopen = () => {
      retry = 500;
      useStore.setState({ connected: true, everConnected: true });
      while (queue.length) ws.send(queue.shift()!);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMsg;
      if (msg.type === 'state') useStore.setState({ state: msg.state });
      else if (msg.type === 'hello') useStore.setState({ lanUrls: msg.lanUrls, claude: msg.claude, home: msg.home, secureUrl: msg.secureUrl ?? null, settings: msg.settings, system: msg.system, local: msg.local });
      else if (msg.type === 'settings') useStore.setState({ settings: msg.settings, system: msg.system });
      else showToast(msg.message);
    };
    ws.onclose = () => {
      useStore.setState({ connected: false });
      if (socket !== ws) return;
      timer = setTimeout(open, retry);
      retry = Math.min(retry * 2, 8000);
    };
  };
  open();
  // Telefon uykudan uyanınca hemen yeniden bağlan
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && socket.readyState > WebSocket.OPEN) {
      clearTimeout(timer);
      retry = 500;
      open();
    }
  });
}

export const useAppState = () => useStore((s) => s.state)!;
