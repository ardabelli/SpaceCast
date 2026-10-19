import { layoutTree } from './meta.ts';
import type { Agent, AppState, Team } from './types.ts';

export const STATE_VERSION = 3;
export const TWIN_ID = 'a-twin';
export const DEFAULT_TWIN_NAME = 'Nova';

const TWIN_PROMPT =
  'Kullanıcının dijital ikizisin. Onun gibi düşünür, onun adına karar verirsin. Gelen isteği doğru ekiplere böl, ' +
  'riskli işlemleri (para, yayın, dış iletişim) ona onaylat ve sonuçları kısa, samimi bir dille raporla.';

function introText(twinName: string, userName: string) {
  return (
    `Selam${userName ? ` ${userName}` : ''}, ben ${twinName}, senin dijital ikizin. Üsteki tüm ekipleri ben yönetiyorum.\n\n` +
    'Ne yapılmasını istiyorsan bana yaz: işi doğru ekiplere böler, para harcamak veya bir şeyi yayına almak gibi ' +
    'kritik adımlarda sana sorar, bitince raporlarım.'
  );
}

/** Kurulumda seçilen isimleri üsse uygular: ikizin adı ve (henüz konuşulmadıysa) karşılama mesajı. */
export function applyNames(s: AppState, twinName: string, userName: string) {
  const twin = s.agents.find((a) => a.id === TWIN_ID);
  if (twin) twin.name = twinName;
  if (s.chat.length === 1 && s.chat[0].id === 'c-0') s.chat[0].text = introText(twinName, userName);
  const first = s.logs.find((l) => l.id === 'l-0');
  if (first) first.text = `Üs çevrimiçi. ${twinName} emirlerini bekliyor.`;
}

type Seed = Pick<Agent, 'id' | 'name' | 'emoji' | 'role' | 'kind' | 'model' | 'teamId' | 'managerId'> & Partial<Agent>;

function agent(s: Seed): Agent {
  return {
    color: '#b48cff',
    autonomy: 'ask',
    tools: [],
    systemPrompt: '',
    budget: 0,
    spent: 0,
    tokens: 0,
    paused: false,
    x: 0,
    y: 0,
    ...s,
  };
}

export function seedState(): AppState {
  const teams: Team[] = [
    { id: 't-dev', name: 'Uygulama Atölyesi', icon: 'code', color: '#b48cff', goal: 'Fikirden yayına uygulama geliştirmek', revenue: 0, boost: false, theme: 'dev' },
    { id: 't-trade', name: 'Ticaret Masası', icon: 'trendingUp', color: '#ffb02e', goal: 'İnternette ucuz al, kârlı sat', revenue: 0, boost: false, theme: 'trade' },
    { id: 't-content', name: 'Araştırma & İçerik', icon: 'book', color: '#4dd8ff', goal: 'Araştırıp rapor ve içerik üretmek', revenue: 0, boost: false, theme: 'lab' },
  ];

  const agents: Agent[] = [
    agent({
      id: TWIN_ID, name: DEFAULT_TWIN_NAME, emoji: '🧬', role: 'Dijital İkiz', kind: 'twin', model: 'claude-opus-5-5',
      teamId: null, managerId: null, color: '#5ccf8f', autonomy: 'ask', tools: ['web_search', 'eposta'],
      systemPrompt: TWIN_PROMPT,
    }),
    // Uygulama Atölyesi
    agent({
      id: 'a-mimar', name: 'Mimar', emoji: '🧠', role: 'Teknik Lider', kind: 'lead', model: 'claude-opus-5-5',
      teamId: 't-dev', managerId: TWIN_ID, color: '#b48cff', tools: ['kod_yaz', 'git'],
      systemPrompt: 'Yazılım ekibinin liderisin. İşi frontend, backend, test ve yayın olarak böl.',
    }),
    agent({ id: 'a-pixel', name: 'Pixel', emoji: '🎨', role: 'Frontend', kind: 'dev', model: 'claude-sonnet-5-5', teamId: 't-dev', managerId: 'a-mimar', color: '#b48cff', tools: ['kod_yaz', 'terminal', 'git', 'tarayici'], autonomy: 'full' }),
    agent({ id: 'a-kernel', name: 'Kernel', emoji: '⚙️', role: 'Backend', kind: 'dev', model: 'claude-sonnet-5-5', teamId: 't-dev', managerId: 'a-mimar', color: '#b48cff', tools: ['kod_yaz', 'terminal', 'git'], autonomy: 'full' }),
    agent({ id: 'a-bekci', name: 'Bekçi', emoji: '🧪', role: 'Test', kind: 'qa', model: 'claude-haiku-5-5', teamId: 't-dev', managerId: 'a-mimar', color: '#b48cff', tools: ['terminal', 'tarayici'], autonomy: 'full' }),
    agent({ id: 'a-rampa', name: 'Rampa', emoji: '🚀', role: 'Yayın / DevOps', kind: 'devops', model: 'claude-sonnet-5-5', teamId: 't-dev', managerId: 'a-mimar', color: '#b48cff', tools: ['terminal', 'deploy'] }),
    // Ticaret Masası
    agent({
      id: 'a-tuccar', name: 'Tüccar', emoji: '🦊', role: 'Ticaret Lideri', kind: 'lead', model: 'claude-opus-5-5',
      teamId: 't-trade', managerId: TWIN_ID, color: '#ffb02e', tools: ['veri'],
      systemPrompt: 'Ticaret masasının liderisin. Fırsatı araştırmacıya buldur, analiste hesaplat, alım-satımı onaya sun.',
    }),
    agent({ id: 'a-radar', name: 'Radar', emoji: '🛰️', role: 'Pazar Araştırması', kind: 'research', model: 'claude-haiku-5-5', teamId: 't-trade', managerId: 'a-tuccar', color: '#ffb02e', tools: ['web_search', 'web_fetch'], autonomy: 'full' }),
    agent({ id: 'a-hesap', name: 'Hesap', emoji: '📊', role: 'Fiyat Analisti', kind: 'analyst', model: 'claude-sonnet-5-5', teamId: 't-trade', managerId: 'a-tuccar', color: '#ffb02e', tools: ['veri'], autonomy: 'full' }),
    agent({ id: 'a-kasa', name: 'Kasa', emoji: '💳', role: 'Alım-Satım', kind: 'trader', model: 'claude-sonnet-5-5', teamId: 't-trade', managerId: 'a-tuccar', color: '#ffb02e', tools: ['pazar_api', 'odeme'], budget: 25 }),
    // Araştırma & İçerik
    agent({ id: 'a-editor', name: 'Editör', emoji: '✒️', role: 'İçerik Lideri', kind: 'lead', model: 'claude-sonnet-5-5', teamId: 't-content', managerId: TWIN_ID, color: '#4dd8ff', tools: ['eposta'] }),
    agent({ id: 'a-kasif', name: 'Kaşif', emoji: '🔭', role: 'Araştırmacı', kind: 'research', model: 'claude-haiku-5-5', teamId: 't-content', managerId: 'a-editor', color: '#4dd8ff', tools: ['web_search', 'web_fetch'], autonomy: 'full' }),
    agent({ id: 'a-kalem', name: 'Kalem', emoji: '📝', role: 'Yazar', kind: 'writer', model: 'claude-sonnet-5-5', teamId: 't-content', managerId: 'a-editor', color: '#4dd8ff', tools: ['kod_yaz', 'eposta'] }),
  ];

  const state: AppState = {
    version: STATE_VERSION,
    agents,
    teams,
    missions: [],
    tasks: [],
    approvals: [],
    logs: [{ id: 'l-0', ts: Date.now(), type: 'system', text: `Üs çevrimiçi. ${DEFAULT_TWIN_NAME} emirlerini bekliyor.` }],
    chat: [{ id: 'c-0', ts: Date.now(), from: 'twin', text: introText(DEFAULT_TWIN_NAME, '') }],
    grants: [],
    sim: { running: true, speed: 1 },
    mode: 'real',
  };
  layoutTree(state);
  return state;
}
