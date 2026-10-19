// Dijital ikiz: kullanıcının yapay zekâ ikizi. Sohbetten gelen isteği yorumlar, ekiplere görev olarak dağıtır
// ve olup biteni sohbete raporlar. Şimdilik kural tabanlı; gerçek ajanlara geçince burası bir model çağrısı olacak.

import { chatOf, pushMessage } from './chats.ts';
import type { AppState, ChatMsg, Mission, Task } from './types.ts';

const uid = (p = '') => p + Math.random().toString(36).slice(2, 10);

export function twinOf(s: AppState) {
  return s.agents.find((a) => a.kind === 'twin');
}

/** İkizin mesajı: verilen sohbete, yoksa görevin açıldığı sohbete, o da yoksa en son sohbete yazılır. */
export function twinSay(s: AppState, text: string, extra: Partial<ChatMsg> = {}, chatId?: string) {
  const id = chatId ?? (extra.missionId ? s.missions.find((m) => m.id === extra.missionId)?.chatId : undefined);
  pushMessage(chatOf(s, id), { id: uid('c-'), ts: Date.now(), from: 'twin', text, ...extra });
}

const TEAM_WORDS: Record<string, string[]> = {
  't-dev': ['uygulama', 'app', 'site', 'web', 'kod', 'yazılım', 'geliştir', 'oyun', 'bot', 'api', 'sayfa', 'ekran', 'mobil', 'program', 'deploy', 'yayına'],
  't-trade': ['al', 'alım', 'sat', 'ticaret', 'pazar', 'etsy', 'amazon', 'trendyol', 'ürün', 'kâr', 'kar', 'fiyat', 'dropship', 'shopify', 'mağaza', 'para', 'kazan', 'gelir'],
  't-content': ['araştır', 'rapor', 'yaz', 'içerik', 'analiz', 'blog', 'video', 'metin', 'sosyal', 'instagram', 'tiktok', 'post', 'pazarlama', 'reklam', 'özet', 'rakip'],
};

const norm = (t: string) => t.toLocaleLowerCase('tr-TR');
const words = (t: string) => norm(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function matchesAny(ws: string[], keys: string[]) {
  return ws.some((w) => keys.some((k) => (k.length <= 3 ? w === k || w.startsWith(k + 'ı') || w.startsWith(k + 'a') || w.startsWith(k + 'm') || w.startsWith(k + 'ış') : w.startsWith(k))));
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' ve ' + names[names.length - 1];
}

function statusReport(s: AppState) {
  const running = s.missions.filter((m) => m.status === 'running');
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const revenue = s.teams.reduce((n, t) => n + (t.revenue ?? 0), 0);
  const spent = s.agents.reduce((n, a) => n + a.spent, 0);
  const lines = [
    running.length ? `Şu an ${running.length} iş sürüyor:` : 'Şu an sürmekte olan bir iş yok, üs sakin.',
    ...running.map((m) => `• ${m.title}`),
    pending.length ? `\n${pending.length} işlem senin onayını bekliyor.` : '',
    `\nToplam kazanç $${revenue.toFixed(2)}, harcama $${spent.toFixed(2)}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Kullanıcı mesajını işler; gerekirse görev oluşturur. `createMission` engine'den gelir (döngüsel import olmasın diye). */
export function twinRespond(
  s: AppState,
  text: string,
  createMission: (s: AppState, m: Mission, ownerTask: Task) => void,
  newTask: (m: Mission, ownerId: string) => Task,
) {
  const twin = twinOf(s);
  if (!twin) {
    twinSay(s, 'Dijital ikiz bulunamadı. Ajanlar arasında "Dijital İkiz" türünde bir ajan olmalı.');
    return;
  }
  const t = norm(text.trim());
  const ws = words(text);

  if (/^(selam|merhaba|naber|nasılsın|hey|sa|slm)\b/.test(t) && ws.length <= 4) {
    twinSay(s, 'Selam! Üs hazır, ekipler boşta bekliyor. Bana bir iş ver — "Etsy\'de satılacak ürün bul" ya da "bana bir yapılacaklar uygulaması yap" gibi.');
    return;
  }
  if (/(durum|rapor ver|ne yapıyorsunuz|neler oluyor|özet geç|nasıl gidiyor)/.test(t) && !/rapor(u)? yaz/.test(t)) {
    twinSay(s, statusReport(s));
    return;
  }
  if (/^(dur|durdur|hepsini durdur|bekle)\b/.test(t)) {
    const running = s.missions.filter((m) => m.status === 'running');
    for (const m of running) m.status = 'paused';
    twinSay(s, running.length ? `Tamam, ${running.length} işi duraklattım. "devam" dersen kaldığımız yerden sürdürürüm.` : 'Duraklatılacak bir iş yok.');
    return;
  }
  if (/^(devam|devam et|sürdür|başlat)\b/.test(t)) {
    const paused = s.missions.filter((m) => m.status === 'paused');
    for (const m of paused) m.status = 'running';
    twinSay(s, paused.length ? `Devam ediyoruz, ${paused.length} iş yeniden çalışıyor.` : 'Duraklatılmış bir iş yok.');
    return;
  }

  // Hangi ekipler? Bilinen ekipler anahtar kelimeyle, kullanıcının kurduğu ekipler isimleriyle eşleşir.
  const leads = s.agents.filter((a) => a.managerId === twin.id && !a.paused);
  const chosen = leads.filter((l) => {
    if (!l.teamId) return false;
    const team = s.teams.find((x) => x.id === l.teamId);
    const keys = TEAM_WORDS[l.teamId] ?? [];
    const own = team ? words(team.name).filter((w) => w.length > 3) : [];
    return matchesAny(ws, keys) || matchesAny(ws, own);
  });
  const targets = chosen.length ? chosen : leads;
  if (!targets.length) {
    twinSay(s, 'Altımda çalışacak kimse yok. Haritada ekip liderlerini bana bağlarsan işleri dağıtabilirim.');
    return;
  }

  const title = text.trim().replace(/\s+/g, ' ');
  const mission: Mission = {
    id: uid('m-'),
    title: title.length > 70 ? title.slice(0, 67) + '…' : title,
    description: title,
    ownerId: twin.id,
    targets: targets.map((l) => l.id),
    status: 'running',
    createdAt: Date.now(),
  };
  createMission(s, mission, newTask(mission, twin.id));

  const teamNames = targets.map((l) => {
    const team = s.teams.find((x) => x.id === l.teamId);
    return team ? team.name : l.name;
  });
  const guessed = !chosen.length;
  twinSay(
    s,
    (guessed ? 'Bunu tek bir ekibe oturtamadım, o yüzden herkesi devreye alıyorum: ' : 'Anlaşıldı. Bunu şuraya veriyorum: ') +
      `${listNames(teamNames)}.\n` +
      'Para harcamak ya da bir şeyi dışarıya göndermek gerekirse önce sana soracağım.',
    { missionId: mission.id },
  );
}
