// SpaceCast sunucusu: durumu tutar, ajanları çalıştırır, arayüzü sunar
// ve tüm cihazlarla (bilgisayar, telefon) WebSocket üzerinden eşitler.

import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import { WebSocketServer, WebSocket } from 'ws';
import { reduce, tick } from '../shared/engine.ts';
import { PROVIDERS } from '../shared/providers.ts';
import { STATE_VERSION, TWIN_ID, applyNames, seedState } from '../shared/seed.ts';
import type { AppState, ClientMsg, ServerMsg } from '../shared/types.ts';
import { providerModels, testProvider } from './ai.ts';
import { claudeInfo, claudeLogin } from './claude.ts';
import { Uploads, checkGrantPath, grantId } from './files.ts';
import { secureUrl } from './tailscale.ts';
import { Runner } from './runner.ts';
import { cleanProvider, getConfig, loadConfig, publicSettings, saveConfig, settings } from './settings.ts';
import { initSystem, installLauncher, setAutostart, setKeepAwake, systemInfo } from './system.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');
const STATE_FILE = join(DATA, 'state.json');
const CONFIG_FILE = join(DATA, 'config.json');
const WORKSPACES = join(DATA, 'workspaces');
const uploads = new Uploads(join(DATA, 'uploads'));
const PORT = Number(process.env.PORT ?? 5199);

// ---------------------------------------------------------------- ayarlar & kayıt

mkdirSync(DATA, { recursive: true });
mkdirSync(WORKSPACES, { recursive: true });
let claude = claudeInfo();
const hadState = existsSync(STATE_FILE);

function loadState(): AppState {
  try {
    if (existsSync(STATE_FILE)) {
      // Eski sürümlerde ikizin kimliği 'a-reshadije' idi; genel kimliğe çevir.
      const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8').replaceAll('"a-reshadije"', `"${TWIN_ID}"`)) as AppState;
      if (saved.version === 2) {
        // v2 → v3: gerçek mod alanı eklendi
        saved.mode = 'sim';
        saved.version = 3;
      }
      saved.grants ??= [];
      // Eski kayıtlarda ekip ikonları emojiydi; çizgi ikon adlarına çevir.
      const legacy: Record<string, string> = { '🛠️': 'code', '💹': 'trendingUp', '📚': 'book' };
      for (const t of saved.teams) if (!/^[a-zA-Z]+$/.test(t.icon)) t.icon = legacy[t.icon] ?? 'target';
      if (saved.version === STATE_VERSION) return saved;
      console.log('  Eski kayıt biçimi bulundu, yeni demo üsle başlanıyor.');
    }
  } catch (e) {
    console.warn('state.json okunamadı, demo durumla başlanıyor:', e);
  }
  return seedState();
}

let state = loadState();
// Simülasyon modu kaldırıldı: üs her zaman seçili yapay zekâ sağlayıcısıyla gerçek modda çalışır.
state.mode = 'real';
state.sim.running = false;
let dirty = false;
// Eski sürümden kalan kurulu bir üs varsa kurulum tamamlanmış sayılır (ikizin adı korunur).
const config = loadConfig(CONFIG_FILE, hadState ? state.agents.find((a) => a.id === TWIN_ID)?.name ?? null : null);
initSystem(ROOT, PORT);

function save() {
  if (!dirty) return;
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_FILE);
  dirty = false;
}
setInterval(save, 2000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { save(); process.exit(0); });
}

// ---------------------------------------------------------------- ağ

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  }
  return out;
}

function isLocal(req: IncomingMessage) {
  const ip = req.socket.remoteAddress ?? '';
  // Tailscale serve gibi bir vekil üzerinden gelen istek yerelden geliyormuş gibi görünür; onlar da anahtar göstermeli.
  if (req.headers['x-forwarded-for'] || req.headers['tailscale-user-login']) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function keyOk(given: string | null) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.key);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
      if (body.length > 64_000) { reject(new Error('çok büyük')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function ollamaUp() {
  try { return (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

/** Kurulum ve ayar uçları. Hepsi yerel ya da anahtarlı istek gerektirir (çağıran yer kontrol eder). */
async function api(req: IncomingMessage, path: string, local: boolean): Promise<[number, unknown]> {
  const post = req.method === 'POST';
  if (path === '/api/ping') return [200, { ok: true, local }];
  if (path === '/api/setup' && !post) {
    claude = claudeInfo();
    return [200, { settings: publicSettings(), system: systemInfo(), claude, ollama: await ollamaUp(), local }];
  }
  if (!post) return [404, {}];
  const body = await readJson(req);
  switch (path) {
    case '/api/setup/models': {
      const p = cleanProvider({ ...body.provider, model: body.provider?.model || '-' });
      if ('error' in p) return [400, { error: p.error }];
      if (PROVIDERS[p.id].engine === 'claude') return [200, { models: [] }];
      try { return [200, { models: await providerModels(p) }]; } catch (e: any) { return [502, { error: e?.message ?? String(e) }]; }
    }
    case '/api/setup/test': {
      const p = cleanProvider(body.provider);
      if ('error' in p) return [400, { error: p.error }];
      return [200, await testProvider(p, WORKSPACES)];
    }
    case '/api/setup/save': {
      const p = cleanProvider(body.provider);
      if ('error' in p) return [400, { error: p.error }];
      const twinName = String(body.twinName ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      const userName = String(body.userName ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!twinName) return [400, { error: 'Dijital ikizine bir isim ver' }];
      Object.assign(getConfig().settings, { done: true, twinName, userName, provider: p });
      saveConfig();
      state = structuredClone(state);
      applyNames(state, twinName, userName);
      dirty = true;
      broadcast();
      broadcastSettings();
      return [200, { ok: true }];
    }
    case '/api/setup/claude-login':
      if (!local) return [403, { error: 'Giriş yalnızca SpaceCast\'in çalıştığı bilgisayardan yapılabilir' }];
      return [200, claudeLogin()];
    case '/api/system': {
      if (typeof body.autostart === 'boolean') setAutostart(body.autostart);
      if (typeof body.keepAwake === 'boolean') setKeepAwake(body.keepAwake);
      broadcastSettings();
      return [200, systemInfo()];
    }
    case '/api/system/launcher':
      if (!local) return [403, { error: 'Kısayol yalnızca bu bilgisayardan eklenebilir' }];
      installLauncher();
      broadcastSettings();
      return [200, systemInfo()];
    case '/api/system/stop':
      setTimeout(() => { save(); process.exit(0); }, 300);
      return [200, { ok: true }];
  }
  return [404, {}];
}

// ---------------------------------------------------------------- HTTP (arayüz dosyaları)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (!isLocal(req) && !keyOk(url.searchParams.get('key') ?? String(req.headers['x-key'] ?? ''))) {
      res.writeHead(401); res.end(); return;
    }
    if (url.pathname === '/api/upload' && req.method === 'POST') { uploads.receive(req, res); return; }
    const m = /^\/api\/file\/([a-f0-9]{12})$/.exec(url.pathname);
    if (m && req.method === 'GET') { uploads.serve(m[1], res); return; }
    api(req, url.pathname, isLocal(req)).then(
      ([code, body]) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); },
      (e) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e?.message ?? e) })); },
    );
    return;
  }
  if (url.pathname === '/manifest.webmanifest' && existsSync(join(DIST, 'manifest.webmanifest'))) {
    // Ana ekrana eklenen uygulama anahtarla açılsın (yalnızca doğru anahtar geri yazılır)
    const m = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'));
    const k = url.searchParams.get('key');
    if (keyOk(k)) m.start_url = `/?key=${encodeURIComponent(k!)}`;
    res.writeHead(200, { 'content-type': MIME['.webmanifest'], 'cache-control': 'no-cache' });
    res.end(JSON.stringify(m));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Arayüz henüz derlenmedi. "npm start" ile başlat.');
    return;
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(file));
});

// ---------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  if (!isLocal(req) && !keyOk(url.searchParams.get('key'))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast() {
  const data = JSON.stringify({ type: 'state', state } satisfies ServerMsg);
  for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}
function broadcastSettings() {
  const data = JSON.stringify({ type: 'settings', settings: publicSettings(), system: systemInfo() } satisfies ServerMsg);
  for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

wss.on('connection', (ws, req: IncomingMessage) => {
  const who = isLocal(req) ? 'bu bilgisayar' : req.socket.remoteAddress;
  console.log(`  ↳ bağlandı: ${who}`);
  const secure = secureUrl(PORT);
  send(ws, {
    type: 'hello',
    lanUrls: lanAddresses().map((ip) => `http://${ip}:${PORT}/?key=${config.key}`),
    claude,
    home: homedir(),
    secureUrl: secure ? `${secure}/?key=${config.key}` : undefined,
    settings: publicSettings(),
    system: systemInfo(),
    local: isLocal(req),
  });
  send(ws, { type: 'state', state });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as ClientMsg;
      if (msg.type !== 'action') return;
      const action = msg.action;
      if (action.type === 'grant/add') {
        // Yol sunucuda doğrulanır; istemcinin gönderdiği yola körü körüne güvenilmez.
        const r = checkGrantPath(action.grant.path);
        if ('error' in r) { send(ws, { type: 'error', message: r.error }); return; }
        action.grant = { id: grantId(), path: r.path, mode: action.grant.mode === 'write' ? 'write' : 'read' };
      }
      if (action.type === 'chat/send' && action.attachments) {
        // Ekleri kimliğinden yeniden kur: istemci rastgele bir dosya yolu gönderemesin.
        action.attachments = action.attachments.map((a) => uploads.find(a.id)).filter((a) => a !== null);
      }
      state = reduce(state, action);
      dirty = true;
      broadcast();
    } catch (e) {
      send(ws, { type: 'error', message: String(e) });
    }
  });
});

// ---------------------------------------------------------------- gerçek mod (yapay zekâ ajanları)

let pending: NodeJS.Timeout | null = null;
function broadcastSoon() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; broadcast(); }, 150);
}

const runner = new Runner({
  get: () => state,
  update: (fn) => {
    state = structuredClone(state);
    fn(state);
    dirty = true;
    broadcastSoon();
  },
  workspaces: WORKSPACES,
  uploads: uploads.dir,
});
setInterval(() => {
  try { runner.step(); } catch (e) { console.error('Yürütücü hatası:', e); }
}, 1000);

// ---------------------------------------------------------------- simülasyon döngüsü

let last = 0;
setInterval(() => {
  const now = Date.now();
  if (now - last < 1000 / state.sim.speed) return;
  last = now;
  const next = tick(state);
  if (next !== state) {
    state = next;
    dirty = true;
    broadcast();
  }
}, 100);

// ---------------------------------------------------------------- başlat

server.listen(PORT, '0.0.0.0', () => {
  const isTs = (ip: string) => { const [a, b] = ip.split('.').map(Number); return a === 100 && b >= 64 && b <= 127; };
  const ips = lanAddresses().sort((a, b) => Number(isTs(b)) - Number(isTs(a)));
  console.log('\n  ◈ SpaceCast çalışıyor\n');
  console.log(`  Bu bilgisayar:  http://localhost:${PORT}`);
  const st = settings();
  console.log(st.done ? `  Yapay zekâ:     ${PROVIDERS[st.provider.id].label}${st.provider.model ? ` · ${st.provider.model}` : ''}` : '  Kurulum:        tarayıcıda açılan sayfadan isimleri ve yapay zekâ sağlayıcısını seç');
  for (const ip of ips) console.log(`  Telefon (${isTs(ip) ? 'Tailscale, her yerden' : 'aynı Wi-Fi'}): http://${ip}:${PORT}/?key=${config.key}`);
  if (ips[0]) {
    console.log(isTs(ips[0]) ? '\n  Telefonla okut (telefonda Tailscale açık olmalı):\n' : '\n  Telefonla okut (aynı Wi-Fi ağında olmalı):\n');
    qrcode.generate(`http://${ips[0]}:${PORT}/?key=${config.key}`, { small: true });
  }
  const sys = systemInfo();
  if (sys.keepAwakeActive) console.log('  Uyku engeli:    açık (SpaceCast kapanınca kalkar)');
  console.log('  Durdurmak için Ctrl+C ya da uygulamadaki Ayarlar → Sunucuyu kapat\n');
  // İlk açılışta kurulum sayfasını tarayıcıda aç (terminalden başlatıldıysa)
  if (!st.done && process.stdout.isTTY && process.env.SPACECAST_NO_OPEN !== '1') {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
    try { spawn(cmd[0] as string, cmd[1] as string[], { stdio: 'ignore', detached: true }).unref(); } catch { /* tarayıcı yok */ }
  }
});
