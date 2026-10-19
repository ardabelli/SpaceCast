// OpenAI uyumlu sohbet API'leri için ajan döngüsü (OpenAI, Gemini, OpenRouter, Ollama, LM Studio…).
// Claude Code'un yerleşik araçlarının küçük bir karşılığını sunar: dosya okuma/listeleme/arama, izinli
// klasörlere yazma, web araması ve sayfa okuma. Komut çalıştırma (Bash) bu motorda yoktur.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { AgentEvent, RunOptions, RunResult } from './claude.ts';

export interface Endpoint {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__']);

function headers(e: Endpoint) {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (e.apiKey) h.authorization = `Bearer ${e.apiKey}`;
  if (e.baseUrl.includes('openrouter.ai')) { h['HTTP-Referer'] = 'https://github.com/spacecast'; h['X-Title'] = 'SpaceCast'; }
  return h;
}

async function errorText(r: Response) {
  const body = await r.text().catch(() => '');
  let msg = body;
  try { const j = JSON.parse(body); msg = j.error?.message ?? j.message ?? (Array.isArray(j) ? j[0]?.error?.message : '') ?? body; } catch { /* düz metin */ }
  return `${r.status} ${String(msg).replace(/\s+/g, ' ').slice(0, 300)}`;
}

/** Sağlayıcının model listesi. */
export async function listModels(e: Omit<Endpoint, 'model'>): Promise<string[]> {
  const r = await fetch(`${e.baseUrl}/models`, { headers: headers({ ...e, model: '' }), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(await errorText(r));
  const j: any = await r.json();
  const ids: string[] = (j.data ?? j.models ?? []).map((m: any) => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean);
  return [...new Set(ids)].sort();
}

/** Düşünme seviyesini (reasoning_effort) reddeden modeller: bir kez reddedince bir daha gönderilmez. */
const NO_EFFORT = new Set<string>();

async function chat(e: Endpoint, body: object, signal: AbortSignal, effort?: string) {
  const post = async (b: object) => {
    const r = await fetch(`${e.baseUrl}/chat/completions`, { method: 'POST', headers: headers(e), body: JSON.stringify({ model: e.model, ...b }), signal });
    if (!r.ok) {
      const err = new Error(await errorText(r)) as Error & { status: number };
      err.status = r.status;
      throw err;
    }
    return (await r.json()) as any;
  };
  const key = `${e.baseUrl}|${e.model}`;
  if (!effort || NO_EFFORT.has(key)) return post(body);
  try {
    return await post({ ...body, reasoning_effort: effort });
  } catch (err: any) {
    if (err?.status !== 400 && err?.status !== 422) throw err;
    // Seviyesiz de hata verirse sorun seviye değildir: hata aynen yukarı gider, model işaretlenmez
    const r = await post(body);
    NO_EFFORT.add(key);
    return r;
  }
}

/** Kısa bir deneme isteği: anahtar ve model çalışıyor mu. */
export async function ping(e: Endpoint): Promise<string> {
  const j = await chat(e, { messages: [{ role: 'user', content: 'Sadece "tamam" yaz.' }], max_tokens: 20 }, AbortSignal.timeout(60_000));
  return String(j.choices?.[0]?.message?.content ?? '').trim();
}

// ------------------------------------------------------------------ araçlar

function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function webSearch(q: string, signal: AbortSignal) {
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' },
    signal,
  });
  if (!r.ok) return `Arama başarısız: ${r.status}`;
  const html = await r.text();
  const out: string[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    let url = m[1];
    const u = /uddg=([^&]+)/.exec(url);
    if (u) url = decodeURIComponent(u[1]);
    out.push(`- ${htmlToText(m[2])}\n  ${url}${m[3] ? `\n  ${htmlToText(m[3]).slice(0, 240)}` : ''}`);
  }
  return out.length ? out.join('\n') : 'Sonuç bulunamadı.';
}

async function fetchUrl(url: string, signal: AbortSignal) {
  if (!/^https?:\/\//.test(url)) return 'Geçersiz adres';
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 SpaceCast' }, signal, redirect: 'follow' });
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok) return `Sayfa açılamadı: ${r.status}`;
  if (!/text|json|xml/.test(type)) return `Metin olmayan içerik (${type})`;
  const body = await r.text();
  const text = /html/.test(type) ? htmlToText(body) : body;
  return text.length > 20_000 ? text.slice(0, 20_000) + '\n… (kısaltıldı)' : text;
}

interface Sandbox {
  cwd: string;
  read: string[];
  write: string[];
}

function inside(p: string, roots: string[]) {
  return roots.some((r) => p === r || p.startsWith(r.endsWith(sep) ? r : r + sep));
}

function resolvePath(sb: Sandbox, p: string, forWrite: boolean) {
  const full = resolve(sb.cwd, String(p ?? '.'));
  if (!inside(full, forWrite ? sb.write : sb.read)) throw new Error(forWrite ? `Bu klasöre yazma izni yok: ${full}` : `Bu klasöre erişim izni yok: ${full}`);
  return full;
}

function walk(dir: string, out: string[], limit: number) {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (out.length >= limit) return;
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out, limit);
    else out.push(full);
  }
}

function globToRe(g: string) {
  return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '.').replace(/\u0000/g, '.*') + '$');
}

const TOOL_DEFS: Record<string, { name: string; description: string; parameters: object }[]> = {
  Read: [{
    name: 'read_file',
    description: 'Bir dosyayı okur (metin dosyaları ve görseller). Yol çalışma klasörüne göre ya da mutlak olabilir.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  }],
  Glob: [{
    name: 'list_files',
    description: 'Bir klasördeki dosyaları alt klasörlerle birlikte listeler. İsteğe bağlı pattern örn. "**/*.md".',
    parameters: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' } } },
  }],
  Grep: [{
    name: 'search_files',
    description: 'Klasördeki metin dosyalarında bir ifadeyi arar, eşleşen satırları döndürür.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'] },
  }],
  Write: [{
    name: 'write_file',
    description: 'Bir dosyayı oluşturur ya da tamamen üzerine yazar. Yalnızca izinli klasörlerde çalışır.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  }],
  Edit: [{
    name: 'edit_file',
    description: 'Dosyadaki bir metni başka bir metinle değiştirir (old_text dosyada aynen bulunmalı).',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] },
  }],
  WebSearch: [{
    name: 'web_search',
    description: 'İnternette arama yapar; başlık, adres ve kısa özet döndürür.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  }],
  WebFetch: [{
    name: 'fetch_url',
    description: 'Bir web sayfasını açıp metnini döndürür.',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  }],
};

const DISPLAY: Record<string, string> = {
  read_file: 'Read', list_files: 'Glob', search_files: 'Grep', write_file: 'Write', edit_file: 'Edit', web_search: 'WebSearch', fetch_url: 'WebFetch',
};

type ToolOut = { text: string; image?: { mime: string; data: string } };

async function runTool(name: string, args: any, sb: Sandbox, signal: AbortSignal): Promise<ToolOut> {
  switch (name) {
    case 'read_file': {
      const p = resolvePath(sb, args.path, false);
      const mime = IMAGE_TYPES[extname(p).toLowerCase()];
      if (mime) return { text: `Görsel: ${p} (aşağıda)`, image: { mime, data: readFileSync(p).toString('base64') } };
      const text = readFileSync(p, 'utf8');
      return { text: text.length > 60_000 ? text.slice(0, 60_000) + '\n… (kısaltıldı)' : text };
    }
    case 'list_files': {
      const base = resolvePath(sb, args.path ?? '.', false);
      const files: string[] = [];
      walk(base, files, 400);
      const re = args.pattern ? globToRe(String(args.pattern)) : null;
      const list = files.map((f) => relative(base, f).split(sep).join('/')).filter((f) => !re || re.test(f) || re.test(f.split('/').pop()!));
      return { text: list.length ? list.slice(0, 300).join('\n') : '(boş)' };
    }
    case 'search_files': {
      const base = resolvePath(sb, args.path ?? '.', false);
      const files: string[] = [];
      walk(base, files, 2000);
      const q = String(args.query).toLowerCase();
      const hits: string[] = [];
      for (const f of files) {
        if (hits.length >= 60) break;
        let text = '';
        try { if (statSync(f).size > 2_000_000) continue; text = readFileSync(f, 'utf8'); } catch { continue; }
        text.split('\n').forEach((line, i) => {
          if (hits.length < 60 && line.toLowerCase().includes(q)) hits.push(`${relative(base, f)}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
      }
      return { text: hits.length ? hits.join('\n') : 'Eşleşme yok.' };
    }
    case 'write_file': {
      const p = resolvePath(sb, args.path, true);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, String(args.content ?? ''));
      return { text: `Yazıldı: ${p}` };
    }
    case 'edit_file': {
      const p = resolvePath(sb, args.path, true);
      const text = readFileSync(p, 'utf8');
      if (!text.includes(args.old_text)) return { text: 'old_text dosyada bulunamadı; önce dosyayı oku.' };
      writeFileSync(p, text.replace(args.old_text, String(args.new_text ?? '')));
      return { text: `Güncellendi: ${p}` };
    }
    case 'web_search':
      return { text: await webSearch(String(args.query), signal) };
    case 'fetch_url':
      return { text: await fetchUrl(String(args.url), signal) };
    default:
      return { text: `Bilinmeyen araç: ${name}` };
  }
}

function describe(name: string, args: any) {
  return String(args?.query ?? args?.url ?? args?.path ?? args?.pattern ?? '').replace(/\s+/g, ' ').slice(0, 120);
}

/** "Write(//abs/path/**)" kurallarından yazılabilir klasörleri çıkarır. */
function writeRoots(allow: string[] = []) {
  const out: string[] = [];
  for (const r of allow) {
    const m = /^(?:Write|Edit)\(\/(.+)\/\*\*\)$/.exec(r);
    if (m) out.push(resolve(m[1]));
  }
  return [...new Set(out)];
}

function parseJson(text: string) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* metnin içinde ara */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* yok */ }
  }
  return undefined;
}

const BASE_SYSTEM =
  'Sen araç kullanabilen bir yapay zekâ ajanısın. Görevini verilen araçlarla gerçekten yap; yapmadığın bir şeyi yaptım deme. ' +
  'Dosya yolları için çalışma klasörüne göre göreli yol kullanabilirsin. İş bitince araç çağırmayı bırak ve kısa bir özet yaz.';

export function runOpenAI(o: RunOptions, e: Endpoint): { child: { kill: () => void }; done: Promise<RunResult> } {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), o.timeoutMs ?? 20 * 60_000);
  const sb: Sandbox = {
    cwd: resolve(o.cwd),
    read: [resolve(o.cwd), ...(o.addDirs ?? []).map((d) => resolve(d))],
    write: o.tools.includes('Write') || o.tools.includes('Edit') ? writeRoots(o.allow) : [],
  };
  const defs = o.tools.flatMap((t) => TOOL_DEFS[t] ?? []).filter((d) => (d.name === 'write_file' || d.name === 'edit_file' ? sb.write.length > 0 : true));
  const tools = defs.map((d) => ({ type: 'function', function: d }));
  const system =
    o.systemPrompt ??
    `${BASE_SYSTEM}\nÇalışma klasörü: ${sb.cwd}` +
      (sb.write.length ? `\nYazabileceğin klasörler: ${sb.write.join(', ')}` : '\nDosya yazma iznin yok.') +
      (o.tools.includes('Bash') ? '\nBu sağlayıcıda komut çalıştırma aracı yok; kodu dosyaya yaz, çalıştırma adımlarını özetinde belirt.' : '') +
      (o.appendSystemPrompt ? `\n\n${o.appendSystemPrompt}` : '');

  const messages: any[] = [{ role: 'system', content: system }, { role: 'user', content: o.prompt }];
  let tokens = 0;
  const count = (j: any) => { tokens += (j.usage?.prompt_tokens ?? 0) + (j.usage?.completion_tokens ?? 0); };
  const emit = (ev: AgentEvent) => { try { o.onEvent?.(ev); } catch { /* yok say */ } };

  const done = (async (): Promise<RunResult> => {
    try {
      let text = '';
      const maxTurns = tools.length ? 40 : 1;
      for (let turn = 0; turn < maxTurns; turn++) {
        // Araçsız ve şemalı çağrılarda tek seferde yapılandırılmış cevap iste
        if (!tools.length && o.schema) break;
        const j = await chat(e, tools.length ? { messages, tools, tool_choice: 'auto' } : { messages }, abort.signal, o.effort);
        count(j);
        const msg = j.choices?.[0]?.message ?? {};
        const calls: any[] = msg.tool_calls ?? [];
        if (msg.content && String(msg.content).trim()) {
          text = String(msg.content).trim();
          if (calls.length) emit({ kind: 'text', text });
        }
        if (!calls.length) break;
        messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
        const images: ToolOut['image'][] = [];
        for (const c of calls) {
          let args: any = {};
          try { args = JSON.parse(c.function?.arguments || '{}'); } catch { /* boş */ }
          const name = c.function?.name ?? '';
          emit({ kind: 'tool', name: DISPLAY[name] ?? name, detail: describe(name, args) });
          let out: ToolOut;
          try { out = await runTool(name, args, sb, abort.signal); } catch (err: any) { out = { text: `Hata: ${err?.message ?? err}` }; }
          messages.push({ role: 'tool', tool_call_id: c.id, content: out.text });
          if (out.image) images.push(out.image);
        }
        if (images.length) {
          messages.push({ role: 'user', content: [{ type: 'text', text: 'Okunan görseller:' }, ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im!.mime};base64,${im!.data}` } }))] });
        }
        if (turn === maxTurns - 1) text ||= 'Adım sınırına ulaşıldı.';
      }

      if (!o.schema) return { ok: true, text, costUsd: 0, tokens };

      // Yapılandırılmış sonuç: önce JSON şeması, desteklenmiyorsa JSON modu, o da yoksa düz istek
      if (tools.length) {
        messages.push({ role: 'assistant', content: text || '(bitti)' });
        messages.push({ role: 'user', content: 'Şimdi sonucunu yalnızca istenen JSON biçiminde ver.' });
      }
      const schemaNote = `Cevabın YALNIZCA şu JSON şemasına uyan bir JSON nesnesi olsun, başka hiçbir şey yazma:\n${JSON.stringify(o.schema)}`;
      const asks = [
        { response_format: { type: 'json_schema', json_schema: { name: 'sonuc', schema: o.schema, strict: false } } },
        { response_format: { type: 'json_object' } },
        {},
      ];
      let lastErr = '';
      for (const extra of asks) {
        try {
          const msgs = [...messages];
          msgs[0] = { role: 'system', content: `${system}\n\n${schemaNote}` };
          const j = await chat(e, { messages: msgs, ...extra }, abort.signal, o.effort);
          count(j);
          const content = String(j.choices?.[0]?.message?.content ?? '');
          const structured = parseJson(content);
          if (structured && typeof structured === 'object') return { ok: true, text: text || content, structured, costUsd: 0, tokens };
          lastErr = 'Model geçerli JSON döndürmedi';
        } catch (err: any) {
          if (abort.signal.aborted) throw err;
          lastErr = err?.message ?? String(err);
          if (err?.status && err.status !== 400 && err.status !== 422) break;
        }
      }
      return { ok: false, text, costUsd: 0, tokens, error: lastErr };
    } catch (err: any) {
      return { ok: false, text: '', costUsd: 0, tokens, error: abort.signal.aborted ? 'durduruldu ya da zaman aşımı' : err?.message ?? String(err) };
    } finally {
      clearTimeout(timer);
    }
  })();

  return { child: { kill: () => abort.abort() }, done };
}

