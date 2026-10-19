// Sohbet ekleri (yükleme / indirme) ve klasör izinlerinin doğrulanması.

import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, realpathSync, statSync, unlinkSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import type { Attachment, Grant } from '../shared/types.ts';

const MAX_UPLOAD = 30 * 1024 * 1024;

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.heic': 'image/heic', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

export function typeOf(name: string) {
  return TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

function safeName(name: string) {
  const clean = name.normalize('NFC').replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(-80);
  return clean || 'dosya';
}

export class Uploads {
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  /** Yalnızca kendi klasörümüzdeki dosyalar ek olarak kabul edilir (istemciden gelen yola güvenilmez). */
  find(id: string): Attachment | null {
    if (!/^[a-f0-9]{12}$/.test(id)) return null;
    const file = readdirSync(this.dir).find((f) => f.startsWith(id + '-'));
    if (!file) return null;
    const path = join(this.dir, file);
    return { id, name: file.slice(id.length + 1), type: typeOf(file), size: statSync(path).size, path };
  }

  receive(req: IncomingMessage, res: ServerResponse) {
    const name = safeName(decodeURIComponent(String(req.headers['x-file-name'] ?? 'dosya')));
    const id = randomBytes(6).toString('hex');
    const path = join(this.dir, `${id}-${name}`);
    const out = createWriteStream(path);
    let size = 0;
    let failed = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_UPLOAD && !failed) {
        failed = true;
        out.destroy();
        try { unlinkSync(path); } catch { /* yok say */ }
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dosya 30 MB sınırını aşıyor' }));
        req.destroy();
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (failed) return;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(this.find(id)));
    });
  }

  serve(id: string, res: ServerResponse) {
    const a = this.find(id);
    if (!a) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': a.type, 'cache-control': 'private, max-age=86400' });
    import('node:fs').then(({ createReadStream }) => createReadStream(a.path).pipe(res));
  }
}

/** Klasör izni için yolu doğrular. Sistem klasörlerine ve gizli/anahtar içeren yerlere izin verilmez. */
export function checkGrantPath(input: string): { path: string } | { error: string } {
  const home = homedir();
  const raw = input.trim().replace(/^~(?=$|\/)/, home);
  if (!raw.startsWith('/')) return { error: 'Tam yol yaz (ör. ~/Desktop/Projeler).' };
  let path: string;
  try {
    path = realpathSync(resolve(raw));
  } catch {
    return { error: 'Böyle bir klasör yok.' };
  }
  if (!existsSync(path) || !statSync(path).isDirectory()) return { error: 'Bu bir klasör değil.' };
  const blocked = ['/System', '/usr', '/bin', '/sbin', '/etc', '/private', '/Library', '/Applications', '/var', '/opt',
    join(home, 'Library'), join(home, '.ssh'), join(home, '.config'), join(home, '.claude'), join(home, '.aws'), join(home, '.gnupg')];
  if (path === '/' || path === home) return { error: 'Tüm diske ya da ev klasörünün tamamına izin verilemez; bir alt klasör seç.' };
  if (blocked.some((b) => path === b || path.startsWith(b + sep))) return { error: 'Sistem ve gizli ayar klasörlerine erişim verilemez.' };
  return { path };
}

export function grantId() {
  return 'g-' + randomBytes(4).toString('hex');
}

export type { Grant };
