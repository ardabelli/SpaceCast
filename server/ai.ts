// Seçili yapay zekâ sağlayıcısına göre ajanı çalıştırır: Claude Code ya da OpenAI uyumlu API.

import { PROVIDERS, modelTier, type ProviderConfig } from '../shared/providers.ts';
import { runClaude, type RunOptions, type RunResult } from './claude.ts';
import { listModels, ping, runOpenAI, type Endpoint } from './openai.ts';
import { settings } from './settings.ts';

/** Durdurulabilen çalışma (Claude süreci ya da API isteği). */
export interface Killable {
  kill(): unknown;
}

function endpoint(p: ProviderConfig, agentModel: string): Endpoint {
  const tier = modelTier(agentModel);
  return {
    baseUrl: p.baseUrl ?? PROVIDERS[p.id].baseUrl ?? '',
    apiKey: p.apiKey,
    model: (tier === 'fast' && p.fastModel) || p.model || '',
  };
}

function claudeEnv(p: ProviderConfig) {
  // Abonelikte ortamda kalmış bir API anahtarı kullanılmasın; anahtarlı modda verilen anahtar kullanılsın.
  return { ANTHROPIC_API_KEY: p.id === 'claude-key' ? p.apiKey : undefined };
}

export function runAgent(o: RunOptions, provider: ProviderConfig = settings().provider): { child: Killable | null; done: Promise<RunResult> } {
  if (PROVIDERS[provider.id].engine === 'claude') return runClaude({ ...o, env: { ...o.env, ...claudeEnv(provider) } });
  return runOpenAI(o, endpoint(provider, o.model));
}

/** Kurulum ekranındaki "Bağlantıyı test et": küçük bir istek gönderir. */
export async function testProvider(p: ProviderConfig, cwd: string): Promise<{ ok: boolean; error?: string; reply?: string }> {
  if (PROVIDERS[p.id].engine === 'claude') {
    const { done } = runAgent({ prompt: 'Sadece "tamam" yaz.', systemPrompt: 'Kısa cevap ver.', model: 'claude-haiku-5-5', cwd, tools: [], effort: 'low', timeoutMs: 90_000 }, p);
    const r = await done;
    return r.ok ? { ok: true, reply: r.text } : { ok: false, error: r.error ?? 'cevap yok' };
  }
  try {
    const reply = await ping(endpoint(p, 'main'));
    return { ok: true, reply };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function providerModels(p: ProviderConfig): Promise<string[]> {
  return listModels({ baseUrl: p.baseUrl ?? PROVIDERS[p.id].baseUrl ?? '', apiKey: p.apiKey });
}
