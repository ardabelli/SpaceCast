// Claude Code CLI'yi (`claude -p`) çalıştıran ince katman. Claude aboneliğiyle (giriş yapılmış CLI) ya da
// Anthropic API anahtarıyla (ANTHROPIC_API_KEY ortam değişkeni) çalışır.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ClaudeInfo } from '../shared/types.ts';

/** Çalıştırılacak dosya ve önüne eklenecek argümanlar (Windows'ta npm kurulumu: node cli.js). */
let BIN: { file: string; pre: string[] } | null = null;

function findBin(): typeof BIN {
  const home = homedir();
  if (process.platform === 'win32') {
    let hits: string[] = [];
    try { hits = execFileSync('where', ['claude'], { encoding: 'utf8' }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean); } catch { /* yok */ }
    hits.push(join(home, '.local', 'bin', 'claude.exe'));
    const exe = hits.find((h) => /\.exe$/i.test(h) && existsSync(h));
    if (exe) return { file: exe, pre: [] };
    // npm ile kurulmuş: claude.cmd doğrudan çalıştırılamaz, yanındaki paketin cli.js'ini node ile aç
    for (const cmd of hits.filter((h) => /\.cmd$/i.test(h))) {
      const cli = join(dirname(cmd), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      if (existsSync(cli)) return { file: process.execPath, pre: [cli] };
    }
    return null;
  }
  try {
    const p = execFileSync('/bin/sh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim();
    if (p) return { file: p, pre: [] };
  } catch { /* PATH'te yok */ }
  // Otomatik başlatmada PATH kısıtlı olabilir: bilinen kurulum yerlerine bak
  for (const p of [join(home, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude', join(home, '.npm-global', 'bin', 'claude')]) {
    if (existsSync(p)) return { file: p, pre: [] };
  }
  return null;
}

function exec(args: string[]) {
  return execFileSync(BIN!.file, [...BIN!.pre, ...args], { encoding: 'utf8', timeout: 15_000 });
}

export function claudeInfo(): ClaudeInfo {
  BIN = findBin();
  if (!BIN) return { installed: false, loggedIn: false };
  try {
    const version = exec(['--version']).trim().split(' ')[0];
    const auth = JSON.parse(exec(['auth', 'status']));
    return { installed: true, version, loggedIn: !!auth.loggedIn, account: auth.authMethod };
  } catch {
    return { installed: true, loggedIn: false };
  }
}

/** Claude aboneliğiyle giriş: tarayıcıyı bu bilgisayarda açar, giriş bitince CLI kendini kaydeder. */
export function claudeLogin(): { ok: boolean; error?: string } {
  if (!BIN) claudeInfo();
  if (!BIN) return { ok: false, error: 'Claude Code kurulu değil' };
  try {
    const child = spawn(BIN.file, [...BIN.pre, 'auth', 'login', '--claudeai'], { stdio: 'ignore', detached: true, windowsHide: true });
    child.unref();
    setTimeout(() => { try { child.kill(); } catch { /* bitti */ } }, 10 * 60_000).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export interface RunOptions {
  prompt: string;
  model: string;
  cwd: string;
  /** Varsayılan Claude Code sistem talimatının yerine geçer (araçsız çağrılar için) */
  systemPrompt?: string;
  /** Varsayılan sistem talimatına eklenir (araç kullanan ajanlar için) */
  appendSystemPrompt?: string;
  /** Kullanılabilir yerleşik araçlar; boş = araçsız */
  tools: string[];
  /** İzinli araç kuralları (ör. "Bash(git *)"); izin verilmeyen her şey sormadan reddedilir */
  allow?: string[];
  schema?: object;
  /** Çalışma klasörü dışında erişilebilecek klasörler (izin kuralları ayrıca uygulanır) */
  addDirs?: string[];
  /** Düşünme derinliği: düşük = daha az token */
  effort?: 'low' | 'medium' | 'high';
  maxBudgetUsd?: number;
  timeoutMs?: number;
  /** Ek ortam değişkenleri (ör. ANTHROPIC_API_KEY); undefined değer o değişkeni kaldırır */
  env?: Record<string, string | undefined>;
  onEvent?: (e: AgentEvent) => void;
}

export type AgentEvent = { kind: 'tool'; name: string; detail: string } | { kind: 'text'; text: string };

export interface RunResult {
  ok: boolean;
  text: string;
  structured?: any;
  costUsd: number;
  tokens: number;
  error?: string;
}

/** Bağlam 400 bin tokene ulaşınca Claude Code konuşmayı otomatik sıkıştırır. */
export const AUTOCOMPACT = '400k';

function describeTool(name: string, input: any): string {
  if (!input || typeof input !== 'object') return '';
  const v = input.query ?? input.url ?? input.file_path ?? input.pattern ?? input.command ?? input.description ?? '';
  return String(v).replace(/\s+/g, ' ').slice(0, 120);
}

export function runClaude(o: RunOptions): { child: ChildProcess | null; done: Promise<RunResult> } {
  if (!BIN) claudeInfo();
  if (!BIN) return { child: null, done: Promise.resolve({ ok: false, text: '', costUsd: 0, tokens: 0, error: 'Claude Code bulunamadı (kurulu mu?)' }) };

  const args = [
    ...BIN.pre,
    '-p', o.prompt,
    '--output-format', 'stream-json', '--verbose',
    '--model', o.model,
    '--no-session-persistence',
    // Kısıtlı mod: kullanıcının ayarlarını yüklemez, dosya araçlarını çalışma klasörüyle sınırlar,
    // komut çalıştıran araçlar yalnızca --tools ile açıkça verilirse gelir. İzinsiz her şey sormadan reddedilir.
    '--restricted', '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--autocompact', AUTOCOMPACT,
    '--tools', o.tools.length ? o.tools.join(',') : '',
  ];
  if (o.allow?.length) args.push('--allowedTools', o.allow.join(','));
  if (o.effort) args.push('--effort', o.effort);
  if (o.addDirs?.length) args.push('--add-dir', ...o.addDirs);
  if (o.systemPrompt) args.push('--system-prompt', o.systemPrompt);
  if (o.appendSystemPrompt) args.push('--append-system-prompt', o.appendSystemPrompt);
  if (o.schema) args.push('--json-schema', JSON.stringify(o.schema));
  if (o.maxBudgetUsd && o.maxBudgetUsd > 0) args.push('--max-budget-usd', o.maxBudgetUsd.toFixed(2));

  const env: Record<string, string | undefined> = { ...process.env, ...o.env };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const child = spawn(BIN.file, args, { cwd: o.cwd, stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });
  let buf = '';
  let stderr = '';
  let final: any = null;

  const done = new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => child.kill('SIGTERM'), o.timeoutMs ?? 20 * 60_000);

    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev: any;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'result') final = ev;
        else if (ev.type === 'assistant' && Array.isArray(ev.message?.content) && o.onEvent) {
          for (const b of ev.message.content) {
            if (b.type === 'tool_use' && b.name !== 'StructuredOutput') o.onEvent({ kind: 'tool', name: b.name, detail: describeTool(b.name, b.input) });
            else if (b.type === 'text' && b.text?.trim()) o.onEvent({ kind: 'text', text: b.text.trim() });
          }
        }
      }
    });
    child.stderr.on('data', (c: Buffer) => { stderr = (stderr + c.toString('utf8')).slice(-2000); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (!final) {
        resolve({ ok: false, text: '', costUsd: 0, tokens: 0, error: stderr.trim() || `claude çıkış kodu ${code}` });
        return;
      }
      const u = final.usage ?? {};
      const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      resolve({
        ok: !final.is_error && final.subtype === 'success',
        text: typeof final.result === 'string' ? final.result : '',
        structured: final.structured_output,
        costUsd: final.total_cost_usd ?? 0,
        tokens,
        error: final.is_error ? String(final.result ?? final.subtype ?? 'hata') : undefined,
      });
    });
  });

  return { child, done };
}
