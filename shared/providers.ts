// Yapay zekâ sağlayıcıları: kurulum ekranında seçilir, sunucu ajanları seçilen sağlayıcıyla çalıştırır.
//   engine 'claude' → bilgisayardaki Claude Code (`claude -p`), abonelik ya da Anthropic API anahtarıyla
//   engine 'openai' → OpenAI uyumlu sohbet API'si (OpenAI, Gemini, OpenRouter, Ollama…), SpaceCast'in kendi ajan döngüsüyle

export type ProviderId = 'claude-sub' | 'claude-key' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'custom';

export interface ProviderPreset {
  label: string;
  engine: 'claude' | 'openai';
  blurb: string;
  needsKey: boolean;
  baseUrl?: string;
  keyUrl?: string;
  /** Model listesinden önerilecek ilk eşleşme (sırayla denenir) */
  prefer?: RegExp[];
  /** Hızlı (ucuz) işler için önerilecek model */
  preferFast?: RegExp[];
}

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  'claude-sub': {
    label: 'Claude · abonelik',
    engine: 'claude',
    blurb: 'Claude Pro/Max aboneliğinle, ek ücret ödemeden. Bilgisayarda Claude Code kurulu ve giriş yapılmış olmalı.',
    needsKey: false,
  },
  'claude-key': {
    label: 'Claude · API anahtarı',
    engine: 'claude',
    blurb: 'Anthropic API anahtarıyla, kullandıkça öde. Bilgisayarda Claude Code kurulu olmalı.',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI · ChatGPT',
    engine: 'openai',
    blurb: 'OpenAI API anahtarıyla GPT modelleri.',
    needsKey: true,
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    prefer: [/^gpt-5(\.\d+)?$/, /^gpt-5/, /^gpt-4\.1$/, /^gpt-4o$/],
    preferFast: [/^gpt-5(\.\d+)?-mini$/, /mini/],
  },
  gemini: {
    label: 'Google Gemini',
    engine: 'openai',
    blurb: 'Google AI Studio anahtarıyla Gemini modelleri. Ücretsiz kotası var.',
    needsKey: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    prefer: [/gemini-[\d.]+-pro$/, /gemini-[\d.]+-flash$/, /gemini/],
    preferFast: [/gemini-[\d.]+-flash$/, /flash/],
  },
  openrouter: {
    label: 'OpenRouter',
    engine: 'openai',
    blurb: 'Tek anahtarla yüzlerce model (Claude, GPT, Gemini, Llama…).',
    needsKey: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    prefer: [/^anthropic\/claude-sonnet/, /^openai\/gpt-5/, /^google\/gemini/],
    preferFast: [/haiku/, /mini/, /flash/],
  },
  ollama: {
    label: 'Ollama · yerel',
    engine: 'openai',
    blurb: 'Ücretsiz, tamamen bilgisayarında çalışır. Ollama kurulu olmalı; araç kullanabilen bir model seç (ör. qwen3).',
    needsKey: false,
    baseUrl: 'http://127.0.0.1:11434/v1',
    prefer: [/qwen3/, /llama3\.[1-9]/, /mistral/],
  },
  custom: {
    label: 'Diğer (OpenAI uyumlu)',
    engine: 'openai',
    blurb: 'OpenAI uyumlu herhangi bir adres: LM Studio, vLLM, Groq, DeepSeek…',
    needsKey: false,
  },
};

export const PROVIDER_ORDER: ProviderId[] = ['claude-sub', 'claude-key', 'openai', 'gemini', 'openrouter', 'ollama', 'custom'];

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
];

/** Kullanıcının kaydettiği sağlayıcı (anahtar yalnızca sunucuda tutulur). */
export interface ProviderConfig {
  id: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  /** Ana model (Claude dışı sağlayıcılarda; Claude'da her ajanın kendi modeli kullanılır) */
  model?: string;
  /** Hızlı işler için model; boşsa ana model */
  fastModel?: string;
}

/** İstemciye giden ayarlar: API anahtarı asla gönderilmez. */
export interface PublicSettings {
  done: boolean;
  userName: string;
  twinName: string;
  provider: Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean };
}

/** Sunucunun çalıştığı bilgisayarla ilgili seçenekler. */
export interface SystemInfo {
  platform: string;
  /** Bilgisayar açılınca SpaceCast da açılsın */
  autostart: boolean;
  autostartSupported: boolean;
  /** SpaceCast açıkken bilgisayar uyumasın */
  keepAwake: boolean;
  keepAwakeActive: boolean;
  keepAwakeSupported: boolean;
  /** Uygulamalar klasörüne açma/kapama kısayolu eklenebilir mi (macOS) */
  launcherSupported: boolean;
  launcherInstalled: boolean;
}

/** Model kimliğinden kademe: Claude dışı sağlayıcılarda ajanın modeli ana ya da hızlı modele eşlenir. */
export function modelTier(id: string): 'strong' | 'balanced' | 'fast' {
  if (/haiku/.test(id)) return 'fast';
  if (/opus/.test(id)) return 'strong';
  return 'balanced';
}

export function pickModel(list: string[], prefer?: RegExp[]) {
  for (const r of prefer ?? []) {
    const hit = list.find((m) => r.test(m));
    if (hit) return hit;
  }
  return list[0] ?? '';
}
