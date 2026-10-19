// data/config.json: erişim anahtarı, kurulum ayarları (isimler, yapay zekâ sağlayıcısı) ve sistem seçenekleri.
// Dosya yalnızca bu bilgisayarda durur; API anahtarı istemcilere hiç gönderilmez.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { PROVIDERS, type ProviderConfig, type ProviderId, type PublicSettings } from '../shared/providers.ts';

export interface Settings {
  done: boolean;
  userName: string;
  twinName: string;
  provider: ProviderConfig;
}

export interface Config {
  key: string;
  settings: Settings;
  system: { autostart: boolean; keepAwake: boolean };
}

const DEFAULT_SETTINGS: Settings = { done: false, userName: '', twinName: '', provider: { id: 'claude-sub' } };

let file = '';
let config: Config;

/** Yükler; eski sürümden kalan kurulu bir üs varsa kurulumu tamamlanmış sayar (Claude aboneliğiyle çalışıyordu). */
export function loadConfig(path: string, existingTwinName: string | null): Config {
  file = path;
  const raw = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  config = {
    key: raw.key || randomBytes(12).toString('base64url'),
    settings: raw.settings ?? (existingTwinName ? { ...DEFAULT_SETTINGS, done: true, twinName: existingTwinName } : { ...DEFAULT_SETTINGS }),
    system: { autostart: false, keepAwake: false, ...raw.system },
  };
  if (!(config.settings.provider.id in PROVIDERS)) config.settings.provider = { id: 'claude-sub' };
  saveConfig();
  return config;
}

export function saveConfig() {
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

export const getConfig = () => config;
export const settings = () => config.settings;

export function publicSettings(): PublicSettings {
  const { apiKey, ...provider } = config.settings.provider;
  return { ...config.settings, provider: { ...provider, hasKey: !!apiKey } };
}

/** İstemciden gelen sağlayıcı ayarını temizler; anahtar boş gelirse (aynı sağlayıcıda) kayıtlı anahtar korunur. */
export function cleanProvider(input: any): ProviderConfig | { error: string } {
  const id = String(input?.id ?? '') as ProviderId;
  const preset = PROVIDERS[id];
  if (!preset) return { error: 'Bilinmeyen sağlayıcı' };
  const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const saved = config.settings.provider;
  const apiKey = str(input.apiKey, 400) || (saved.id === id ? saved.apiKey ?? '' : '');
  const baseUrl = (str(input.baseUrl) || preset.baseUrl || '').replace(/\/+$/, '');
  if (preset.needsKey && !apiKey) return { error: 'API anahtarı gerekli' };
  if (preset.engine === 'openai') {
    if (!/^https?:\/\//.test(baseUrl)) return { error: 'Geçerli bir API adresi gir (http:// ya da https://)' };
    if (!str(input.model)) return { error: 'Bir model seç' };
  }
  return {
    id,
    apiKey: apiKey || undefined,
    baseUrl: preset.engine === 'openai' ? baseUrl : undefined,
    model: str(input.model) || undefined,
    fastModel: str(input.fastModel) || undefined,
  };
}
