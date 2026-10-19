// Gerçek mod yürütücüsü: dijital ikizin sohbet beyni ve ajanların seçili yapay zekâ sağlayıcısıyla gerçekten çalışması.
//
// Akış: kullanıcı yazar → ikiz cevap verir, gerekirse görev açar → ekip liderleri işi ekiplerine böler
// → yaprak ajanlar çalışma klasöründe gerçek iş yapar (dosya, web araçlarıyla) → liderler sonuçları
// birleştirir → ikiz kullanıcıya raporlar. Dış dünyayı etkileyen her işlem
// onay kuyruğuna öneri olarak düşer; ajanlar bunları kendileri yapamaz.

import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { log, newTask, startMission, uid } from '../shared/engine.ts';
import { chatOf } from '../shared/chats.ts';
import { KINDS, RECOMMENDED_EFFORT } from '../shared/meta.ts';
import { twinOf, twinSay } from '../shared/twin.ts';
import type { Agent, AppState, Attachment, Grant, Mission, Task } from '../shared/types.ts';
import { runAgent, type Killable } from './ai.ts';
import type { RunResult } from './claude.ts';
import { settings } from './settings.ts';

export interface Host {
  get(): AppState;
  update(fn: (s: AppState) => void): void;
  workspaces: string;
  uploads: string;
}

const MAX_PARALLEL = 3;
/** Aynı anda en fazla bu kadar sohbete cevap hazırlanır. */
const MAX_TWIN = 2;

/** Ajanın düşünme seviyesi: elle seçilmişse o, değilse bu çağrı için önerilen. */
function effortOf(a: Agent, recommended: 'low' | 'medium' | 'high') {
  return a.effort && a.effort !== 'auto' ? a.effort : recommended;
}

const finished = (t: Task) => t.status === 'done' || t.status === 'skipped';

function slug(t: string) {
  return t
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]!)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function teamOf(s: AppState, a: Agent) {
  return a.teamId ? s.teams.find((t) => t.id === a.teamId) : undefined;
}

function identity(s: AppState, a: Agent) {
  const team = teamOf(s, a);
  return (
    `Sen ${a.name}'sin: ${team ? `${team.name} ekibinde ` : ''}${a.role} (${KINDS[a.kind].label}) olarak çalışan bir yapay zekâ ajanısın. ` +
    `Kullanıcının dijital ikizi ${twinOf(s)?.name ?? ''} tarafından yönetilen bir ajan üssündesin.` +
    (a.systemPrompt ? `\n\n${a.systemPrompt}` : '')
  );
}

/** Kullanıcının açtığı klasörler: hepsi okunabilir, yalnızca 'write' olanlara (ve çalışma klasörüne) yazılabilir. */
function access(grants: Grant[], cwd: string, canWrite: boolean) {
  const writable = canWrite ? [cwd, ...grants.filter((g) => g.mode === 'write').map((g) => g.path)] : [];
  return {
    addDirs: grants.map((g) => g.path),
    writeRules: writable.flatMap((d) => [`Write(/${d}/**)`, `Edit(/${d}/**)`]),
  };
}

function grantText(grants: Grant[]) {
  return grants.length
    ? grants.map((g) => `- ${g.path} (${g.mode === 'write' ? 'okuma + yazma' : 'sadece okuma'})`).join('\n')
    : '';
}

const attText = (list?: Attachment[]) => (list?.length ? list.map((a) => `${a.path} (${a.type})`).join(', ') : '');

/** Ajanın araçları: --tools (kullanılabilir) ve --allowedTools (sormadan izinli). */
function toolsFor(a: Agent) {
  const tools = new Set(['Read', 'Glob', 'Grep']);
  const allow = new Set(['Read', 'Glob', 'Grep']);
  const add = (t: string) => { tools.add(t); allow.add(t); };
  if (a.tools.includes('web_search')) add('WebSearch');
  if (a.tools.includes('web_fetch') || a.tools.includes('tarayici')) add('WebFetch');
  if (a.autonomy !== 'readonly') {
    // Write/Edit kullanılabilir ama izin kuralları ayrı (access()) – yalnızca izinli klasörlere.
    tools.add('Write');
    tools.add('Edit');
    const bash: string[] = [];
    if (a.tools.includes('git')) bash.push('Bash(git *)');
    if (a.tools.includes('terminal') && a.autonomy === 'full') {
      bash.push('Bash(npm *)', 'Bash(npx *)', 'Bash(node *)', 'Bash(python3 *)', 'Bash(ls *)', 'Bash(mkdir *)', 'Bash(cat *)');
    }
    if (bash.length) {
      tools.add('Bash');
      for (const b of bash) allow.add(b);
    }
  }
  return { tools: [...tools], allow: [...allow] };
}

function baseSummary(s: AppState) {
  const twin = twinOf(s);
  const lines: string[] = [];
  for (const team of s.teams) {
    const members = s.agents.filter((a) => a.teamId === team.id);
    const lead = members.find((a) => a.managerId === twin?.id);
    lines.push(`- [${team.id}] ${team.name} — amaç: ${team.goal}${lead ? ` — lider: ${lead.name}` : ' — (ikize bağlı lider yok)'}`);
    lines.push(`    üyeler: ${members.map((m) => `${m.name} (${m.role})`).join(', ')}`);
  }
  const running = s.missions.filter((m) => m.status === 'running' || m.status === 'paused');
  const pending = s.approvals.filter((p) => p.status === 'pending');
  const revenue = s.teams.reduce((n, t) => n + (t.revenue ?? 0), 0);
  const spent = s.agents.reduce((n, a) => n + a.spent, 0);
  return [
    'EKİPLER',
    ...lines,
    '',
    `SÜREN İŞLER: ${running.length ? running.map((m) => `"${m.title}" (${m.status === 'paused' ? 'duraklatıldı' : 'sürüyor'})`).join(', ') : 'yok'}`,
    `ONAY BEKLEYEN: ${pending.length ? pending.map((p) => `${s.agents.find((a) => a.id === p.agentId)?.name}: ${p.action}`).join(' | ') : 'yok'}`,
    `TOPLAM HARCAMA: $${spent.toFixed(2)} · KAYITLI GELİR: $${revenue.toFixed(2)}`,
  ].join('\n');
}

export class Runner {
  private inflight = new Map<string, Killable | null>();
  private twinStartedAt = new Map<string, string | undefined>();
  private host: Host;

  constructor(host: Host) {
    this.host = host;
    // Sunucu yeniden başladıysa yarıda kalan gerçek görevleri baştan al.
    host.update((s) => {
      for (const c of s.chats) c.busy = s.mode === 'real' && c.messages.at(-1)?.from === 'user';
      for (const t of s.tasks) if (t.real && (t.status === 'planning' || t.status === 'running')) t.status = 'pending';
    });
  }

  private busy() {
    return this.inflight.size;
  }

  /** Her saniye çağrılır. */
  step() {
    const s = this.host.get();
    if (!settings().done) {
      // Kurulum bitmeden yapay zekâ sağlayıcısı yok: bekleyen mesaja kısa bir yönlendirme yaz.
      for (const c of s.chats.filter((x) => x.busy)) {
        this.host.update((d) => { chatOf(d, c.id).busy = false; twinSay(d, 'Önce kurulumu tamamla: yapay zekâ sağlayıcısını seçince hemen başlıyorum.', {}, c.id); });
      }
      return;
    }

    // İptal edilen / silinen görevlerin süreçlerini durdur.
    for (const [key, child] of this.inflight) {
      if (key.startsWith('twin:')) {
        // Silinen sohbetin cevabını beklemeye gerek yok
        if (!s.chats.some((c) => `twin:${c.id}` === key)) { child?.kill(); this.inflight.delete(key); }
        continue;
      }
      const t = s.tasks.find((x) => x.id === key);
      const m = t && s.missions.find((x) => x.id === t.missionId);
      if (!t || !m || m.status === 'cancelled' || t.status === 'skipped') {
        child?.kill();
        this.inflight.delete(key);
      }
    }

    for (const c of s.chats) {
      const thinking = [...this.inflight.keys()].filter((k) => k.startsWith('twin:')).length;
      if (c.busy && !this.inflight.has(`twin:${c.id}`) && thinking < MAX_TWIN) this.thinkTwin(c.id);
    }

    for (const m of s.missions) {
      if (!m.real || m.status !== 'running') continue;
      if (!m.workspace) this.makeWorkspace(m);
      this.advance(m.id);
    }
  }

  // ------------------------------------------------------------ dijital ikiz

  private thinkTwin(chatId: string) {
    const s = this.host.get();
    const twin = twinOf(s);
    const chat = s.chats.find((c) => c.id === chatId);
    if (!chat) return;
    if (!twin) {
      this.host.update((d) => { chatOf(d, chatId).busy = false; twinSay(d, 'Dijital ikiz ajanı bulunamadı.', {}, chatId); });
      return;
    }
    const lastId = chat.messages.at(-1)?.id;
    this.twinStartedAt.set(chatId, lastId);
    const teamIds = s.teams.filter((t) => s.agents.some((a) => a.teamId === t.id && a.managerId === twin.id)).map((t) => t.id);

    // Cevaplanmamış kullanıcı mesajları (ikizin son mesajından sonrakiler) ve ekleri
    let i = chat.messages.length;
    while (i > 0 && chat.messages[i - 1].from === 'user') i--;
    const unanswered = chat.messages.slice(i);
    const files = unanswered.flatMap((c) => c.attachments ?? []);
    const voice = unanswered.some((c) => c.voice);

    // Token tasarrufu: son 12 mesaj; eski uzun cevaplar kısaltılır.
    const history = chat.messages
      .slice(-12)
      .map((c, k, arr) => {
        const recent = k >= arr.length - unanswered.length;
        const text = !recent && c.text.length > 500 ? c.text.slice(0, 500) + ' …' : c.text;
        const att = c.attachments?.length ? `\n[ekler: ${attText(c.attachments)}]` : '';
        return `${c.from === 'user' ? (c.voice ? 'Kullanıcı (sesle)' : 'Kullanıcı') : twin.name}: ${text}${att}`;
      })
      .join('\n\n');

    // İkiz ekiplerin çıktılarını (çalışma klasörleri) her zaman okuyabilir; araç tanımları önbelleğe alındığı için ucuzdur.
    const needsTools = true;
    const system =
      `Senin adın ${twin.name}. Kullanıcının dijital ikizi ve onun yapay zekâ ajan üssünün komutanısın. ${twin.systemPrompt}\n\n` +
      (settings().userName ? `Kullanıcının adı: ${settings().userName}.\n` : '') +
      'Kullanıcıyla Türkçe, samimi, kısa ve net konuşursun. Onun adına düşünür, işleri doğru ekiplere dağıtırsın.\n' +
      '- Kullanıcı bir iş yapılmasını istediğinde action="mission" seç. teamIds ile işi yapacak ekipleri seç (yalnızca gerçekten gereken ekipler). ' +
      'brief alanına ekip liderlerinin anlayacağı net bir görev tanımı yaz: hedef, kapsam, beklenen çıktı ve kullanıcının verdiği tüm ayrıntılar. ' +
      'Kullanıcının eklediği dosyalar görevle birlikte ekiplere "ekler/" klasöründe iletilir; brief içinde bunlardan bahset.\n' +
      '- Sohbet, soru, fikir alışverişi veya durum sorusu ise action="none" seç ve cevabı kendin ver. Kısa sorular için ekip çalıştırma.\n' +
      '- Kullanıcı süren işleri durdurmak isterse action="pause", sürdürmek isterse action="resume".\n' +
      '- İstek belirsizse görev açmadan önce kısa bir netleştirme sorusu sor (action="none").\n' +
      '- Bir işin yapıldığını asla uydurma: ajanlar çalışıp bitirince sonucu ayrıca raporlayacaksın.\n' +
      '- Para harcamak, alım-satım, yayına almak, dışarıya mesaj göndermek gibi işlemler her zaman kullanıcının onayından geçer.' +
      (needsTools
        ? `\n- Ekiplerin ürettiği dosyalar ${this.host.workspaces} altındaki görev klasörlerinde; kullanıcı bir rapor/çıktı sorarsa Read ile açıp anlat. ` +
          'Gereksiz dosya okuma: sadece soru gerektirdiğinde araç kullan.' +
          '\n- Kullanıcı görsel veya dosya eklediyse Read ile açıp gerçekten incele. Erişim verilen klasörlerde Glob/Grep/Read ile arama yapabilirsin; ' +
          'yalnızca "okuma + yazma" izni olanlara yazabilirsin. Bunların dışında dosyaya dokunma.'
        : '') +
      (voice ? '\n- Kullanıcı sesle konuşuyor: cevabı sesli okunacak şekilde kısa (en fazla 3-4 cümle), düz konuşma diliyle yaz; Markdown, liste ve emoji kullanma.' : '');

    const prompt =
      `ÜS DURUMU\n${baseSummary(s)}\n` +
      (s.grants.length ? `\nERİŞİM VERİLEN KLASÖRLER\n${grantText(s.grants)}\n` : '') +
      (() => {
        const recent = s.missions.filter((m) => m.workspace).slice(-5);
        return recent.length ? `\nSON GÖREVLERİN KLASÖRLERİ\n${recent.map((m) => `- "${m.title}" (${m.status}): ${m.workspace}`).join('\n')}\n` : '';
      })() +
      `\nSOHBET\n${history}\n\nKullanıcının son mesajına cevap ver.`;
    const schema = {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Kullanıcıya gösterilecek cevap' },
        action: { type: 'string', enum: ['none', 'mission', 'pause', 'resume'] },
        mission: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Kısa görev başlığı' },
            brief: { type: 'string' },
            teamIds: { type: 'array', items: teamIds.length ? { type: 'string', enum: teamIds } : { type: 'string' } },
          },
          required: ['title', 'brief', 'teamIds'],
          additionalProperties: false,
        },
      },
      required: ['reply', 'action'],
      additionalProperties: false,
    };

    const twinDir = join(this.host.workspaces, '_ikiz');
    mkdirSync(twinDir, { recursive: true });
    const acc = access(s.grants, twinDir, true);
    // Araçlar yalnızca gerektiğinde: araç tanımları her çağrıda token demektir.
    const tools = needsTools ? ['Read', 'Glob', 'Grep', ...(acc.writeRules.length > 2 ? ['Write', 'Edit'] : [])] : [];
    const { child, done } = runAgent({
      prompt,
      systemPrompt: system,
      model: twin.model,
      cwd: twinDir,
      tools,
      allow: needsTools ? ['Read', 'Glob', 'Grep', ...acc.writeRules] : undefined,
      addDirs: needsTools ? [this.host.uploads, this.host.workspaces, ...acc.addDirs] : undefined,
      schema,
      // Görsel ya da dosya varsa önerilen seviye bir kademe yukarı
      effort: effortOf(twin, files.length ? 'medium' : RECOMMENDED_EFFORT.twin),
      timeoutMs: 5 * 60_000,
    });
    const key = `twin:${chatId}`;
    this.inflight.set(key, child);
    done.then((r) => {
      this.inflight.delete(key);
      this.host.update((d) => {
        this.charge(d, twin.id, r);
        const c = d.chats.find((x) => x.id === chatId);
        if (!c) return;
        c.busy = c.messages.at(-1)?.from === 'user' && c.messages.at(-1)?.id !== this.twinStartedAt.get(chatId);
        if (!r.ok || !r.structured) {
          twinSay(d, `Yapay zekâ sağlayıcısına ulaşamadım: ${r.error ?? 'boş cevap'}. Ayarlar'dan sağlayıcıyı ve bağlantıyı kontrol edebilirsin.`, {}, chatId);
          return;
        }
        const out = r.structured as { reply: string; action: string; mission?: { title: string; brief: string; teamIds: string[] } };
        let missionId: string | undefined;
        if (out.action === 'mission' && out.mission) missionId = this.openMission(d, out.mission, files, chatId);
        if (out.action === 'pause') for (const m of d.missions) if (m.status === 'running') m.status = 'paused';
        if (out.action === 'resume') for (const m of d.missions) if (m.status === 'paused') m.status = 'running';
        twinSay(d, out.reply, missionId ? { missionId } : {}, chatId);
      });
    });
  }

  private openMission(d: AppState, spec: { title: string; brief: string; teamIds: string[] }, files: Attachment[] = [], chatId?: string) {
    const twin = twinOf(d)!;
    const leads = d.agents.filter((a) => a.managerId === twin.id && !a.paused);
    let targets = leads.filter((l) => l.teamId && spec.teamIds.includes(l.teamId));
    if (!targets.length) targets = leads;
    const m: Mission = {
      id: uid('m-'),
      title: spec.title.slice(0, 80),
      description: spec.brief + (files.length ? `\n\nEkler (çalışma klasöründe ekler/ altında): ${files.map((f) => f.name).join(', ')}` : ''),
      ownerId: twin.id,
      targets: targets.map((t) => t.id),
      attachments: files.length ? files : undefined,
      chatId,
      status: 'running',
      createdAt: Date.now(),
    };
    startMission(d, m, newTask(m, null, twin, m.title));
    return m.id;
  }

  // ------------------------------------------------------------ görev ilerletme

  private makeWorkspace(m: Mission) {
    const day = new Date().toISOString().slice(0, 10);
    const dir = join(this.host.workspaces, `${day}-${slug(m.title) || 'gorev'}-${m.id.slice(-4)}`);
    mkdirSync(dir, { recursive: true });
    if (m.attachments?.length) {
      mkdirSync(join(dir, 'ekler'), { recursive: true });
      for (const a of m.attachments) {
        try { copyFileSync(a.path, join(dir, 'ekler', a.name)); } catch { /* dosya silinmiş olabilir */ }
      }
    }
    this.host.update((d) => {
      const x = d.missions.find((y) => y.id === m.id);
      if (x) x.workspace = dir;
    });
  }

  private advance(missionId: string) {
    const s = this.host.get();
    const m = s.missions.find((x) => x.id === missionId)!;
    for (const t of s.tasks.filter((x) => x.missionId === m.id)) {
      if (this.inflight.has(t.id) || finished(t)) continue;
      const a = s.agents.find((x) => x.id === t.assigneeId);
      if (!a) {
        this.host.update((d) => { const x = d.tasks.find((y) => y.id === t.id); if (x) x.status = 'skipped'; });
        continue;
      }

      if (t.status === 'pending') {
        if (a.paused || this.busy() >= MAX_PARALLEL) continue;
        const earlier = s.tasks.filter((k) => k.parentId === t.parentId && k.id !== t.id && t.parentId !== null && (k.stage ?? 1) < (t.stage ?? 1));
        if (!earlier.every(finished)) continue;
        if (a.budget > 0 && a.spent >= a.budget) {
          this.host.update((d) => {
            const x = d.agents.find((y) => y.id === a.id);
            if (x) x.paused = true;
            log(d, { type: 'error', agentId: a.id, text: `${a.name} harcama limitine ($${a.budget}) ulaştı ve durduruldu` });
          });
          continue;
        }
        let reports = s.agents.filter((r) => r.managerId === a.id && !r.paused);
        if (t.parentId === null && m.targets?.length) {
          const only = reports.filter((r) => m.targets!.includes(r.id));
          if (only.length) reports = only;
        }
        if (!reports.length) this.work(t.id);
        else if (a.kind === 'twin' && t.parentId === null) this.delegate(t.id, reports.map((r) => ({ agentId: r.id, title: '', instructions: m.description })));
        // Token tasarrufu: tek kişilik ekipte plan yapmaya gerek yok, iş doğrudan verilir.
        else if (reports.length === 1) this.delegate(t.id, [{ agentId: reports[0].id, title: '', instructions: t.brief ?? m.description }]);
        else this.plan(t.id, reports);
      } else if (t.status === 'waiting_children') {
        const kids = s.tasks.filter((k) => k.parentId === t.id);
        if (kids.every(finished) && this.busy() < MAX_PARALLEL) this.summarize(t.id);
      } else if (t.status === 'waiting_approval') {
        const mine = s.approvals.filter((p) => p.taskId === t.id);
        if (mine.every((p) => p.status !== 'pending')) {
          this.host.update((d) => {
            const x = d.tasks.find((y) => y.id === t.id)!;
            x.status = 'done';
            const ok = mine.filter((p) => p.status === 'approved').length;
            log(d, { type: 'result', agentId: a.id, missionId: m.id, text: `${a.name}: ${ok}/${mine.length} öneri onaylandı (uygulama için ödeme/yayın entegrasyonu henüz bağlı değil; kayda geçti)` });
          });
        }
      }
    }

    const fresh = this.host.get();
    const root = fresh.tasks.find((t) => t.missionId === m.id && t.parentId === null);
    if (root && finished(root)) {
      this.host.update((d) => {
        const x = d.missions.find((y) => y.id === m.id);
        if (!x || x.status !== 'running') return;
        x.status = 'done';
        x.finishedAt = Date.now();
        log(d, { type: 'result', missionId: m.id, text: `🏁 Görev tamamlandı: "${x.title}"` });
      });
    }
  }

  private delegate(taskId: string, subtasks: { agentId: string; title: string; instructions: string; stage?: number }[], plan?: string) {
    this.host.update((d) => {
      const t = d.tasks.find((x) => x.id === taskId)!;
      const m = d.missions.find((x) => x.id === t.missionId)!;
      const boss = d.agents.find((x) => x.id === t.assigneeId)!;
      if (plan) log(d, { type: 'info', agentId: boss.id, missionId: m.id, text: `${boss.name} planı: ${plan.slice(0, 300)}` });
      for (const st of subtasks) {
        const r = d.agents.find((x) => x.id === st.agentId);
        if (!r) continue;
        const team = teamOf(d, r);
        const title = st.title || (boss.kind === 'twin' && team ? `${m.title} — ${team.name}` : `${m.title} · ${r.role}`);
        const k = newTask(m, t.id, r, title);
        k.brief = st.instructions;
        k.stage = st.stage ?? 1;
        d.tasks.push(k);
        log(d, { type: 'delegate', agentId: boss.id, toAgentId: r.id, missionId: m.id, text: `${boss.name} → ${r.name}${(st.stage ?? 1) > 1 ? ` (aşama ${st.stage})` : ''}: "${title}"` });
      }
      t.status = 'waiting_children';
    });
  }

  private plan(taskId: string, reports: Agent[]) {
    const s = this.host.get();
    const t = s.tasks.find((x) => x.id === taskId)!;
    const m = s.missions.find((x) => x.id === t.missionId)!;
    const a = s.agents.find((x) => x.id === t.assigneeId)!;
    this.host.update((d) => {
      const x = d.tasks.find((y) => y.id === taskId)!;
      x.status = 'planning';
      x.steps.push({ text: 'Görevi ekibine bölüyor' });
      x.stepIndex = x.steps.length - 1;
      log(d, { type: 'info', agentId: a.id, missionId: m.id, text: `${a.name} görevi aldı ve planlıyor` });
    });
    const team = reports.map((r) => `- ${r.id}: ${r.name} — ${r.role} (${KINDS[r.kind].label}; araçlar: ${r.tools.join(', ') || '-'})`).join('\n');
    const prompt =
      `GÖREV: ${m.title}\n\nTANIM:\n${m.description}\n` +
      (t.brief && t.brief !== m.description ? `\nSANA ÖZEL TALİMAT:\n${t.brief}\n` : '') +
      `\nEKİBİN:\n${team}\n\n` +
      'Bu işi ekibine böl. Sadece gerçekten gereken üyelere iş ver. Her alt görev için net talimat yaz: ne yapılacak, hangi dosyaya ne yazılacak, ' +
      'teslim edilecek çıktı ne. Ekip aynı çalışma klasörünü paylaşıyor; dosya adlarını çakışmayacak şekilde belirt.\n' +
      'Her alt göreve bir aşama (stage) numarası ver: aynı aşamadaki işler aynı anda çalışır, bir aşama ancak önceki aşamaların hepsi bitince başlar. ' +
      'Başka bir işin çıktısına ihtiyaç duyan işi (ör. araştırma notlarından rapor yazmak, kodu test etmek) daha sonraki bir aşamaya koy. ' +
      'Sonraki aşamadaki ajanlar önceki aşamaların sonuç özetlerini ve klasördeki dosyaları görecek.';
    const schema = {
      type: 'object',
      properties: {
        plan: { type: 'string', description: 'Planın 1-2 cümlelik özeti' },
        subtasks: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              agentId: { type: 'string', enum: reports.map((r) => r.id) },
              title: { type: 'string' },
              instructions: { type: 'string' },
              stage: { type: 'integer', minimum: 1, maximum: 5 },
            },
            required: ['agentId', 'title', 'instructions', 'stage'],
            additionalProperties: false,
          },
        },
      },
      required: ['plan', 'subtasks'],
      additionalProperties: false,
    };
    const { child, done } = runAgent({ prompt, systemPrompt: identity(s, a), model: a.model, cwd: m.workspace ?? this.host.workspaces, tools: [], schema, effort: effortOf(a, 'low'), timeoutMs: 5 * 60_000 });
    this.inflight.set(taskId, child);
    done.then((r) => {
      this.inflight.delete(taskId);
      this.host.update((d) => this.charge(d, a.id, r));
      const out = r.structured as { plan: string; subtasks: { agentId: string; title: string; instructions: string; stage: number }[] } | undefined;
      if (r.ok && out?.subtasks?.length) this.delegate(taskId, out.subtasks, out.plan);
      else {
        this.host.update((d) => log(d, { type: 'error', agentId: a.id, missionId: m.id, text: `${a.name} plan yapamadı (${r.error ?? 'boş cevap'}); iş ekibe olduğu gibi veriliyor` }));
        this.delegate(taskId, reports.map((x) => ({ agentId: x.id, title: '', instructions: t.brief ?? m.description })));
      }
    });
  }

  private work(taskId: string) {
    const s = this.host.get();
    const t = s.tasks.find((x) => x.id === taskId)!;
    const m = s.missions.find((x) => x.id === t.missionId)!;
    const a = s.agents.find((x) => x.id === t.assigneeId)!;
    const cwd = m.workspace ?? this.host.workspaces;
    const { tools, allow } = toolsFor(a);
    const acc = access(s.grants, cwd, a.autonomy !== 'readonly');
    allow.push(...acc.writeRules);
    this.host.update((d) => {
      const x = d.tasks.find((y) => y.id === taskId)!;
      x.status = 'running';
      x.steps.push({ text: 'İşe başladı' });
      x.stepIndex = x.steps.length - 1;
      log(d, { type: 'info', agentId: a.id, missionId: m.id, text: `${a.name} çalışmaya başladı: "${t.title}"` });
    });

    const rules =
      '\n\nÇALIŞMA KURALLARI\n' +
      `- Çalışma klasörün: ${cwd} (ekibinle paylaşıyorsun). ` +
      (a.autonomy === 'readonly'
        ? 'Dosya yazamazsın; bulgularını özetinde ver.\n'
        : 'Ürettiğin her şeyi (kod, rapor, notlar) bu klasöre dosya olarak yaz. Önce klasörde ne olduğuna bak.\n') +
      '- Para harcamak, satın almak/satmak, ilan açmak, bir şeyi yayına almak (deploy), e-posta/mesaj göndermek, hesap açmak gibi geri alınamaz ' +
      've dış dünyayı etkileyen işlemleri ASLA kendin yapma. Bunları approvals listesine öneri olarak yaz (action: ne yapılacağı, amount: varsa USD tutarı). ' +
      'Kullanıcı onaylarsa ayrıca yapılacak.\n' +
      (s.grants.length ? `- Kullanıcının sana açtığı klasörler:\n${grantText(s.grants)}\n  Sadece "okuma + yazma" olanlara yazabilirsin.\n` : '') +
      (m.attachments?.length ? '- Kullanıcının ekleri çalışma klasöründe ekler/ altında; görselleri Read ile açıp incele.\n' : '') +
      '- Bilmediğin şeyi uydurma. Web araştırması yaptıysan kaynak bağlantılarını rapora ekle.\n' +
      '- Verimli çalış: gereksiz dosya okuma ve tekrar aramadan kaçın, işi bitirince dur.\n' +
      '- Bitirince kısa bir Türkçe özet (summary) ve oluşturduğun dosyaların listesini (files) ver.';

    const before = s.tasks.filter((k) => k.parentId === t.parentId && k.id !== t.id && (k.stage ?? 1) < (t.stage ?? 1) && k.result);
    const prompt =
      `ANA GÖREV: ${m.title}\n\nGENEL TANIM:\n${m.description}\n\n` +
      `SENİN İŞİN: ${t.title}\n${t.brief && t.brief !== m.description ? `\nTALİMAT:\n${t.brief}\n` : ''}` +
      (before.length
        ? `\nÖNCEKİ AŞAMALARIN SONUÇLARI (ayrıntılar klasördeki dosyalarda):\n${before.map((k) => `- ${s.agents.find((x) => x.id === k.assigneeId)?.name}: ${(k.result ?? '').slice(0, 800)}`).join('\n')}\n`
        : '');
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        approvals: {
          type: 'array',
          items: {
            type: 'object',
            properties: { action: { type: 'string' }, amount: { type: 'number' } },
            required: ['action'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'files', 'approvals'],
      additionalProperties: false,
    };

    const remaining = a.budget > 0 ? Math.max(0.5, a.budget - a.spent) : undefined;
    const { child, done } = runAgent({
      prompt,
      appendSystemPrompt: identity(s, a) + rules,
      model: a.model,
      cwd,
      tools,
      allow,
      addDirs: acc.addDirs,
      schema,
      effort: effortOf(a, RECOMMENDED_EFFORT[a.kind]),
      maxBudgetUsd: remaining,
      onEvent: (e) =>
        this.host.update((d) => {
          const x = d.tasks.find((y) => y.id === taskId);
          if (!x) return;
          if (e.kind === 'tool') {
            const text = `${e.name}${e.detail ? `: ${e.detail}` : ''}`;
            x.steps.push({ tool: e.name, text });
            log(d, { type: 'tool', agentId: a.id, missionId: m.id, text: `[${a.name}] ${text}` });
          } else {
            x.steps.push({ text: e.text.split('\n')[0].slice(0, 140) });
          }
          if (x.steps.length > 60) x.steps.splice(0, x.steps.length - 60);
          x.stepIndex = x.steps.length - 1;
        }),
    });
    this.inflight.set(taskId, child);

    done.then((r) => {
      this.inflight.delete(taskId);
      this.host.update((d) => {
        this.charge(d, a.id, r);
        const x = d.tasks.find((y) => y.id === taskId);
        if (!x || finished(x)) return;
        const out = r.structured as { summary: string; files: string[]; approvals: { action: string; amount?: number }[] } | undefined;
        if (!r.ok || !out) {
          x.status = 'done';
          x.result = `Tamamlanamadı: ${r.error ?? 'boş cevap'}`;
          log(d, { type: 'error', agentId: a.id, missionId: m.id, text: `${a.name}: ${x.result}` });
          return;
        }
        x.result = out.summary + (out.files.length ? `\nDosyalar: ${out.files.join(', ')}` : '');
        log(d, { type: 'result', agentId: a.id, missionId: m.id, text: `${a.name}: ${out.summary.slice(0, 300)}` });
        const props = a.autonomy === 'readonly' ? [] : out.approvals;
        if (!props.length) {
          x.status = 'done';
          return;
        }
        x.status = 'waiting_approval';
        for (const p of props) {
          const id = uid('p-');
          d.approvals.push({ id, ts: Date.now(), agentId: a.id, missionId: m.id, taskId, action: p.action, amount: p.amount, status: 'pending' });
          log(d, { type: 'approval', agentId: a.id, missionId: m.id, text: `${a.name} onay istiyor: ${p.action}` });
          twinSay(d, `${a.name} şunu önermek istiyor: ${p.action}${p.amount !== undefined ? ` ($${p.amount})` : ''}. Onay veriyor musun?`, { missionId: m.id, approvalId: id });
        }
      });
    });
  }

  private summarize(taskId: string) {
    const s = this.host.get();
    const t = s.tasks.find((x) => x.id === taskId)!;
    const m = s.missions.find((x) => x.id === t.missionId)!;
    const a = s.agents.find((x) => x.id === t.assigneeId)!;
    const kids = s.tasks.filter((k) => k.parentId === t.id);
    const results = kids.map((k) => `### ${s.agents.find((x) => x.id === k.assigneeId)?.name ?? '?'} — ${k.title}\n${(k.result ?? '(sonuç yok)').slice(0, 1500)}`).join('\n\n');
    const pending = s.approvals.filter((p) => p.missionId === m.id && p.status === 'pending').map((p) => p.action);
    const isTwin = a.kind === 'twin';
    if (!isTwin && kids.length === 1) {
      // Token tasarrufu: tek kişilik işte birleştirilecek bir şey yok, sonucu olduğu gibi yukarı ilet.
      this.host.update((d) => {
        const x = d.tasks.find((y) => y.id === taskId);
        if (!x || finished(x)) return;
        x.status = 'done';
        x.result = kids[0].result;
      });
      return;
    }
    const prompt = isTwin
      ? `"${m.title}" görevi bitti. Ekiplerin raporları:\n\n${results}\n\nÇalışma klasörü: ${m.workspace}\n` +
        (pending.length ? `Hâlâ onay bekleyenler: ${pending.join(' | ')}\n` : '') +
        '\nKullanıcıya, onun dijital ikizi olarak kısa ve samimi bir Türkçe rapor yaz: ne yapıldı, çıktılar nerede, varsa sorunlar ve tek bir sonraki adım önerisi. Başlık ve madde işaretleri kullanabilirsin, uzun tutma.'
      : `"${m.title}" görevinde ekibinin sonuçları:\n\n${results}\n\nBunları üst yöneticin için tek bir kısa Türkçe rapora birleştir: ne yapıldı, hangi dosyalar, açık kalan konular.`;

    this.host.update((d) => {
      const x = d.tasks.find((y) => y.id === taskId)!;
      x.steps.push({ text: 'Ekibin sonuçlarını birleştiriyor' });
      x.stepIndex = x.steps.length - 1;
    });
    const { child, done } = runAgent({ prompt, systemPrompt: identity(s, a), model: a.model, cwd: m.workspace ?? this.host.workspaces, tools: [], effort: effortOf(a, 'low'), timeoutMs: 5 * 60_000 });
    this.inflight.set(taskId, child);
    done.then((r) => {
      this.inflight.delete(taskId);
      this.host.update((d) => {
        this.charge(d, a.id, r);
        const x = d.tasks.find((y) => y.id === taskId);
        if (!x || finished(x)) return;
        x.status = 'done';
        x.result = r.ok && r.text ? r.text : kids.map((k) => k.result).join('\n');
        log(d, { type: 'result', agentId: a.id, missionId: m.id, text: `${a.name}: ekip raporu hazır` });
        if (isTwin) twinSay(d, x.result, { missionId: m.id });
      });
    });
  }

  private charge(d: AppState, agentId: string, r: RunResult) {
    const a = d.agents.find((x) => x.id === agentId);
    if (!a) return;
    a.spent = +(a.spent + r.costUsd).toFixed(4);
    a.tokens += r.tokens;
  }
}
