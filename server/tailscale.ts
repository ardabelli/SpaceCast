// Tailscale "serve" ile HTTPS açıldıysa güvenli adresi bulur (telefonda mikrofon HTTPS ister).

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const CANDIDATES = ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale'];
const BIN = CANDIDATES.find((p) => existsSync(p));

let cache: { at: number; url: string | null } = { at: 0, url: null };

export function secureUrl(port: number): string | null {
  if (!BIN) return null;
  if (Date.now() - cache.at < 30_000) return cache.url;
  let url: string | null = null;
  try {
    const serve = execFileSync(BIN, ['serve', 'status', '--json'], { encoding: 'utf8', timeout: 3000 });
    if (serve.includes(`:${port}`)) {
      const st = JSON.parse(execFileSync(BIN, ['status', '--json'], { encoding: 'utf8', timeout: 3000 }));
      const dns = String(st?.Self?.DNSName ?? '').replace(/\.$/, '');
      if (dns) url = `https://${dns}`;
    }
  } catch {
    url = null;
  }
  cache = { at: Date.now(), url };
  return url;
}
