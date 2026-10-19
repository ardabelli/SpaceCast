import type { AgentKind, AppState, Autonomy, ModelId, Step, Team, TeamTheme } from './types.ts';

export const THEMES: Record<TeamTheme, { label: string; hint: string }> = {
  lab: { label: 'Araştırma laboratuvarı', hint: 'Önlüklü bilim insanları, deney tüpleri' },
  dev: { label: 'Mühendislik atölyesi', hint: 'Sunucu dolapları, kod ekranları' },
  trade: { label: 'Ticaret katı', hint: 'Borsa panosu, takım elbiseler' },
  ops: { label: 'Komuta odası', hint: 'Üniformalar, radar ekranı' },
};

/** Ekip odasının teması: seçilmişse o, değilse ikondan/adından tahmin. */
export function themeOf(team: Pick<Team, 'theme' | 'icon' | 'name'> | undefined | null): TeamTheme {
  if (!team) return 'ops';
  if (team.theme) return team.theme;
  const i = team.icon;
  if (['code', 'wrench', 'rocket', 'shield', '🛠️'].includes(i)) return 'dev';
  if (['trendingUp', 'cart', 'chart', '💹'].includes(i)) return 'trade';
  if (['book', 'pen', 'flask', 'globe', '📚'].includes(i)) return 'lab';
  return 'ops';
}

export const KINDS: Record<AgentKind, { label: string; emoji: string }> = {
  twin: { label: 'Dijital İkiz', emoji: '🧬' },
  commander: { label: 'Komutan', emoji: '🦅' },
  lead: { label: 'Takım Lideri', emoji: '🧭' },
  dev: { label: 'Geliştirici', emoji: '💻' },
  qa: { label: 'Test Uzmanı', emoji: '🧪' },
  devops: { label: 'DevOps', emoji: '🚀' },
  research: { label: 'Araştırmacı', emoji: '🔭' },
  analyst: { label: 'Analist', emoji: '📊' },
  trader: { label: 'Alım-Satım', emoji: '💳' },
  writer: { label: 'Yazar', emoji: '📝' },
  custom: { label: 'Özel', emoji: '🤖' },
};

export const MODELS: Record<ModelId, { label: string; costPerTick: number; tokensPerTick: number }> = {
  'claude-opus-5-5': { label: 'Opus 5.5', costPerTick: 0.045, tokensPerTick: 2400 },
  'claude-sonnet-5-5': { label: 'Sonnet 5.5', costPerTick: 0.018, tokensPerTick: 1800 },
  'claude-haiku-5-5': { label: 'Haiku 5.5', costPerTick: 0.004, tokensPerTick: 900 },
};

export const AUTONOMY: Record<Autonomy, { label: string; hint: string }> = {
  full: { label: 'Tam yetkili', hint: 'Riskli işlemleri de kendi yapar' },
  ask: { label: 'Onay ister', hint: 'Para, deploy gibi işlemlerde sana sorar' },
  readonly: { label: 'Salt okunur', hint: 'Sadece araştırır ve önerir' },
};

export const TOOLS: Record<string, string> = {
  web_search: 'Web arama',
  web_fetch: 'Sayfa okuma',
  tarayici: 'Tarayıcı',
  kod_yaz: 'Dosya yazma',
  terminal: 'Terminal',
  git: 'Git',
  deploy: 'Deploy',
  pazar_api: 'Pazar yeri API',
  odeme: 'Ödeme',
  eposta: 'E-posta',
  veri: 'Veri / Tablo',
};

export const TEAM_COLORS = ['#7c6cff', '#1fbf8f', '#f2a93b', '#ef5d8f', '#3fa7f5', '#b06cf0', '#e8664a'];

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

/** Bir ajan işi kendisi yaptığında (alt ekibi yoksa) izleyeceği adımlar. */
export function stepsFor(kind: AgentKind, mission: string): Step[] {
  switch (kind) {
    case 'dev':
      return [
        { tool: 'kod_yaz', text: 'Proje yapısını inceliyor' },
        { tool: 'kod_yaz', text: `"${mission}" için kodu yazıyor` },
        { tool: 'terminal', text: 'Testleri çalıştırıyor' },
        { tool: 'git', text: 'Değişiklikleri commit ediyor' },
      ];
    case 'qa':
      return [
        { tool: 'tarayici', text: 'Uçtan uca testleri koşturuyor' },
        { tool: 'terminal', text: 'Kenar durumları deniyor' },
        { text: 'Hata raporunu hazırlıyor' },
      ];
    case 'devops':
      return [
        { tool: 'terminal', text: 'Build alıyor' },
        { tool: 'terminal', text: 'Staging ortamına kuruyor' },
        { tool: 'deploy', text: 'Production ortamına deploy', risky: true },
      ];
    case 'research':
      return [
        { tool: 'web_search', text: `"${mission}" için kaynak tarıyor` },
        { tool: 'web_fetch', text: `${rand(6, 18)} sayfayı okuyor` },
        { text: 'Bulguları özetliyor' },
      ];
    case 'analyst':
      return [
        { tool: 'veri', text: 'Fiyat geçmişini çekiyor' },
        { tool: 'veri', text: 'Kâr marjlarını hesaplıyor' },
        { text: 'En iyi 3 fırsatı sıralıyor' },
      ];
    case 'trader': {
      const buy = rand(40, 220);
      return [
        { tool: 'pazar_api', text: 'İlanları tarıyor' },
        { tool: 'odeme', text: `Ürünü $${buy} karşılığında satın alma`, risky: true, amount: buy },
        { tool: 'pazar_api', text: `Satış ilanı açma ($${Math.round(buy * 1.35)})`, risky: true },
      ];
    }
    case 'writer':
      return [
        { tool: 'kod_yaz', text: 'Taslağı yazıyor' },
        { text: 'Metni düzenliyor' },
        { tool: 'eposta', text: 'Raporu e-postayla gönderme', risky: true },
      ];
    case 'twin':
    case 'commander':
    case 'lead':
      return [
        { text: 'Görevi analiz ediyor' },
        { text: 'Kendi başına çözüyor' },
      ];
    default:
      return [
        { text: 'Görev üzerinde çalışıyor' },
        { text: 'Sonucu hazırlıyor' },
      ];
  }
}

export const RESULTS: Record<AgentKind, string[]> = {
  twin: ['Tüm ekiplerden rapor toplandı, iş tamam'],
  commander: ['Tüm hatlardan rapor toplandı, görev tamamlandı'],
  lead: ['Ekip çıktıları birleştirildi', 'Takım raporu hazır'],
  dev: ['4 dosya değişti, testler geçti', 'Yeni özellik hazır, 12 test geçti'],
  qa: ['2 küçük hata bulundu ve raporlandı', 'Tüm testler yeşil'],
  devops: ['Sürüm yayında', 'Build ve kurulum tamam'],
  research: ['9 kaynaktan özet çıkarıldı', 'Pazar özeti hazır'],
  analyst: ['En kârlı 3 fırsat belirlendi', 'Ortalama marj %18'],
  trader: ['İşlem tamam, tahmini kâr %35', 'Alım-satım döngüsü kapandı'],
  writer: ['Rapor taslağı hazır', '1.200 kelimelik metin tamam'],
  custom: ['İş bitti'],
};

export const NODE_W = 236;
export const NODE_H = 108;

/** Hiyerarşiye göre ajanları ağaç şeklinde dizer (yerinde değiştirir). */
export function layoutTree(state: AppState) {
  const byId = new Map(state.agents.map((a) => [a.id, a]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  const order = (ids: string[]) =>
    ids.sort((a, b) => {
      const A = byId.get(a)!;
      const B = byId.get(b)!;
      return (A.teamId ?? '').localeCompare(B.teamId ?? '') || A.name.localeCompare(B.name);
    });
  for (const a of state.agents) {
    if (a.managerId && byId.has(a.managerId)) {
      const list = children.get(a.managerId) ?? [];
      list.push(a.id);
      children.set(a.managerId, list);
    } else roots.push(a.id);
  }
  const GAP_X = 36;
  const GAP_Y = 150;
  // Farklı takımlardaki kardeşler arasında takım kutularının sığacağı kadar boşluk bırak.
  const gap = (a: string, b: string) => (byId.get(a)!.teamId === byId.get(b)!.teamId ? GAP_X : GAP_X * 3);
  const widthOf = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = order(children.get(id) ?? []);
    const gaps = kids.slice(1).reduce((s, k, i) => s + gap(kids[i], k), 0);
    const w = kids.length ? Math.max(NODE_W, kids.reduce((s, k) => s + measure(k), 0) + gaps) : NODE_W;
    widthOf.set(id, w);
    return w;
  };
  const place = (id: string, x: number, depth: number) => {
    const a = byId.get(id)!;
    const w = widthOf.get(id)!;
    a.x = Math.round(x + w / 2 - NODE_W / 2);
    a.y = depth * (NODE_H + GAP_Y);
    const kids = children.get(id) ?? [];
    const total = kids.reduce((s, k, i) => s + widthOf.get(k)! + (i ? gap(kids[i - 1], k) : 0), 0);
    let cx = x + (w - total) / 2;
    kids.forEach((k, i) => {
      if (i) cx += gap(kids[i - 1], k);
      place(k, cx, depth + 1);
      cx += widthOf.get(k)!;
    });
  };
  const top = (id: string) => (byId.get(id)!.kind === 'twin' ? -2 : byId.get(id)!.kind === 'commander' ? -1 : 0);
  roots.sort((a, b) => top(a) - top(b));
  let x = 0;
  for (const r of roots) {
    measure(r);
    place(r, x, 0);
    x += widthOf.get(r)! + GAP_X * 3;
  }
}
