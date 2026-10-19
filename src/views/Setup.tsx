// İlk açılış kurulumu, giriş ekranı ve Ayarlar: isimler, yapay zekâ sağlayıcısı, sunucu seçenekleri.

import { useEffect, useRef, useState } from 'react';
import { CLAUDE_MODELS, PROVIDERS, PROVIDER_ORDER, pickModel, type ProviderId, type PublicSettings } from '../../shared/providers.ts';
import type { ClaudeInfo } from '../../shared/types.ts';
import { Icon } from '../icons.tsx';
import { api, setKey, showToast, useStore } from '../store.ts';
import { Modal } from '../ui.tsx';
import { AvatarPicker } from './AvatarPicker.tsx';
import { SpacePicker } from './SpacePicker.tsx';

interface SetupStatus {
  settings: PublicSettings;
  claude: ClaudeInfo;
  ollama: boolean;
  local: boolean;
}

export interface Draft {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  fastModel: string;
}

export function draftFrom(s: PublicSettings | null): Draft {
  const p = s?.provider;
  return { id: p?.id ?? 'claude-sub', apiKey: '', baseUrl: p?.baseUrl ?? '', model: p?.model ?? '', fastModel: p?.fastModel ?? '' };
}

const TWIN_IDEAS = ['Nova', 'Atlas', 'Orion', 'Lyra', 'Vega', 'Echo'];
const IS_WIN = navigator.userAgent.includes('Windows');

function useStatus() {
  const [st, setSt] = useState<SetupStatus | null>(null);
  const load = () => api<SetupStatus>('/api/setup').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  return { st, reload: load };
}

// ------------------------------------------------------------------ sağlayıcı formu

export function ProviderForm({ draft, setDraft, onTested }: { draft: Draft; setDraft: (d: Draft) => void; onTested: (ok: boolean) => void }) {
  const saved = useStore((s) => s.settings);
  const { st, reload } = useStatus();
  const preset = PROVIDERS[draft.id];
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelErr, setModelErr] = useState('');
  const [test, setTest] = useState<{ busy: boolean; ok?: boolean; msg?: string }>({ busy: false });
  const [login, setLogin] = useState(false);
  const keySaved = !!saved?.provider.hasKey && saved.provider.id === draft.id;

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setTest({ busy: false });
    onTested(false);
  };

  const choose = (id: ProviderId) => {
    setModels([]);
    setModelErr('');
    const same = saved?.provider.id === id;
    set({ id, apiKey: '', baseUrl: (same && saved?.provider.baseUrl) || PROVIDERS[id].baseUrl || '', model: same ? saved?.provider.model ?? '' : '', fastModel: same ? saved?.provider.fastModel ?? '' : '' });
  };

  // Claude dışı sağlayıcılarda modelleri anahtar/adres girilince getir
  const canList = preset.engine === 'openai' && !!(draft.baseUrl || preset.baseUrl) && (!preset.needsKey || draft.apiKey || keySaved);
  const fetchModels = async () => {
    if (!canList) return;
    setLoadingModels(true);
    setModelErr('');
    try {
      const r = await api<{ models: string[] }>('/api/setup/models', { provider: draft });
      setModels(r.models);
      if (r.models.length && !r.models.includes(draft.model)) {
        setDraft({ ...draft, model: pickModel(r.models, preset.prefer), fastModel: preset.preferFast ? pickModel(r.models, preset.preferFast) : '' });
      }
    } catch (e: any) {
      setModels([]);
      setModelErr(e.message);
    } finally {
      setLoadingModels(false);
    }
  };
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    if (canList) timer.current = setTimeout(fetchModels, 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, draft.apiKey, draft.baseUrl, canList]);

  // Claude girişinden sonra durumu birkaç dakika boyunca yokla
  useEffect(() => {
    if (!login) return;
    const t = setInterval(reload, 3000);
    const stop = setTimeout(() => setLogin(false), 3 * 60_000);
    return () => { clearInterval(t); clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login]);
  useEffect(() => { if (st?.claude.loggedIn) setLogin(false); }, [st?.claude.loggedIn]);

  const runTest = async () => {
    setTest({ busy: true });
    try {
      const r = await api<{ ok: boolean; error?: string; reply?: string }>('/api/setup/test', { provider: draft });
      setTest({ busy: false, ok: r.ok, msg: r.ok ? 'Bağlantı çalışıyor' : r.error });
      onTested(r.ok);
    } catch (e: any) {
      setTest({ busy: false, ok: false, msg: e.message });
      onTested(false);
    }
  };

  const claude = st?.claude;
  const claudeEngine = preset.engine === 'claude';
  const claudeReady = claudeEngine && claude?.installed && (draft.id === 'claude-key' || claude.loggedIn);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="prov-grid">
        {PROVIDER_ORDER.map((id) => (
          <button key={id} className={`prov-card ${draft.id === id ? 'on' : ''}`} onClick={() => choose(id)}>
            <b>{PROVIDERS[id].label}</b>
            <span>{PROVIDERS[id].blurb}</span>
          </button>
        ))}
      </div>

      {claudeEngine && claude && !claude.installed && (
        <div className="note">
          <b>Claude Code bu bilgisayarda kurulu değil.</b> Terminalde şunu çalıştır, sonra "Tekrar kontrol et"e bas:
          <pre className="mono cmd">{IS_WIN ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash'}</pre>
          <button className="btn sm" onClick={reload}><Icon name="refresh" size={14} /> Tekrar kontrol et</button>
        </div>
      )}
      {draft.id === 'claude-sub' && claude?.installed && (
        claude.loggedIn ? (
          <div className="note ok"><Icon name="check" size={16} /> Claude Code hazır, giriş yapılmış ({claude.account ?? 'claude.ai'}).</div>
        ) : (
          <div className="note">
            <b>Claude hesabına giriş yapılmamış.</b>{' '}
            {st?.local ? 'Butona basınca tarayıcıda Claude giriş sayfası açılır; giriş bitince burası kendiliğinden güncellenir.' : 'Giriş için SpaceCast\'in çalıştığı bilgisayarda terminale "claude" yazıp giriş yap.'}
            <div className="row" style={{ marginTop: 8 }}>
              {st?.local && (
                <button className="btn sm primary" disabled={login} onClick={async () => {
                  try { await api('/api/setup/claude-login', {}); setLogin(true); } catch (e: any) { showToast(e.message); }
                }}>{login ? 'Giriş bekleniyor…' : 'Claude ile giriş yap'}</button>
              )}
              <button className="btn sm" onClick={reload}><Icon name="refresh" size={14} /> Tekrar kontrol et</button>
            </div>
          </div>
        )
      )}
      {draft.id === 'ollama' && st && !st.ollama && (
        <div className="note">
          <b>Ollama çalışmıyor.</b> <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com</a>'dan kurup açın, sonra bir model indir:
          <pre className="mono cmd">ollama pull qwen3:8b</pre>
          <button className="btn sm" onClick={() => { reload(); fetchModels(); }}><Icon name="refresh" size={14} /> Tekrar kontrol et</button>
        </div>
      )}

      {(preset.needsKey || draft.id === 'custom') && (
        <label className="field">
          <span>API ANAHTARI {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer">· anahtar al</a>}</span>
          <input className="input" type="password" autoComplete="off" value={draft.apiKey} placeholder={keySaved ? 'Kayıtlı anahtar kullanılıyor (değiştirmek için yaz)' : draft.id === 'custom' ? 'Gerekmiyorsa boş bırak' : 'Anahtarı yapıştır'}
            onChange={(e) => set({ apiKey: e.target.value.trim() })} />
          <small className="dim">Anahtar yalnızca bu bilgisayarda, SpaceCast'in data klasöründe saklanır.</small>
        </label>
      )}
      {draft.id === 'custom' && (
        <label className="field">
          <span>API ADRESİ</span>
          <input className="input" value={draft.baseUrl} placeholder="ör. http://127.0.0.1:1234/v1" onChange={(e) => set({ baseUrl: e.target.value.trim() })} />
        </label>
      )}

      {preset.engine === 'openai' && (
        <div className="row wrap" style={{ alignItems: 'flex-end', gap: 10 }}>
          <label className="field grow">
            <span>ANA MODEL</span>
            {models.length ? (
              <select className="input" value={draft.model} onChange={(e) => set({ model: e.target.value })}>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input className="input" value={draft.model} placeholder={loadingModels ? 'Modeller yükleniyor…' : 'Model adı'} onChange={(e) => set({ model: e.target.value.trim() })} />
            )}
          </label>
          <label className="field grow">
            <span>HIZLI MODEL (isteğe bağlı)</span>
            {models.length ? (
              <select className="input" value={draft.fastModel} onChange={(e) => set({ fastModel: e.target.value })}>
                <option value="">Ana modelle aynı</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input className="input" value={draft.fastModel} placeholder="Boşsa ana model" onChange={(e) => set({ fastModel: e.target.value.trim() })} />
            )}
          </label>
          <button className="btn icon" title="Modelleri yeniden getir" disabled={!canList || loadingModels} onClick={fetchModels}><Icon name="refresh" size={15} /></button>
        </div>
      )}
      {modelErr && <div className="note bad">Model listesi alınamadı: {modelErr}</div>}
      {claudeEngine && <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Her ajan kendi Claude modelini kullanır ({CLAUDE_MODELS.map((m) => m.label).join(', ')}); ajan ayarlarından değiştirebilirsin.</p>}
      {preset.engine === 'openai' && <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Ajanlar dosya okuyup yazabilir ve web'de arama yapabilir; komut çalıştırma yalnızca Claude ile çalışır. Araç kullanabilen (tool calling) bir model seç.</p>}

      <div className="row wrap">
        <button className="btn" disabled={test.busy || (claudeEngine && !claudeReady) || (preset.engine === 'openai' && !draft.model)} onClick={runTest}>
          {test.busy ? 'Deneniyor…' : 'Bağlantıyı test et'}
        </button>
        {test.ok === true && <span className="badge ok"><Icon name="check" size={12} /> {test.msg}</span>}
        {test.ok === false && <span className="err-text">{test.msg}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sunucu seçenekleri

function Toggle({ on, label, hint, disabled, onChange }: { on: boolean; label: string; hint?: string; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`toggle-row ${disabled ? 'off' : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i className="switch" />
      <span className="grow">
        <b>{label}</b>
        {hint && <small className="dim">{hint}</small>}
      </span>
    </label>
  );
}

export function ServerOptions({ showStop = true }: { showStop?: boolean }) {
  const sys = useStore((s) => s.system);
  const local = useStore((s) => s.local);
  const [busy, setBusy] = useState(false);
  if (!sys) return null;
  const mac = sys.platform === 'darwin';
  const call = async (path: string, body: object) => {
    setBusy(true);
    try { await api(path, body); } catch (e: any) { showToast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <Toggle on={sys.autostart} disabled={busy || !sys.autostartSupported} label="Bilgisayar açılınca SpaceCast da açılsın"
        hint="Oturum açtığında sunucu arka planda kendiliğinden başlar." onChange={(v) => call('/api/system', { autostart: v })} />
      <Toggle on={sys.keepAwake} disabled={busy || !sys.keepAwakeSupported} label={mac ? 'Açıkken bilgisayar uyumasın (şarjdayken)' : 'Açıkken bilgisayar uyumasın'}
        hint="Telefondan her an bağlanabilmek için. SpaceCast kapanınca kalkar." onChange={(v) => call('/api/system', { keepAwake: v })} />
      {sys.launcherSupported && local && (
        <div className="row wrap">
          <button className="btn sm" disabled={busy} onClick={() => call('/api/system/launcher', {}).then(() => showToast('Uygulamalar klasörüne SpaceCast eklendi'))}>
            <Icon name="power" size={14} /> {sys.launcherInstalled ? 'Açma/kapama kısayolunu yenile' : 'Uygulamalar\'a açma/kapama kısayolu ekle'}
          </button>
          <small className="dim">Dock'a sürükle: tıklayınca sunucuyu açar, açıksa kapatmayı sorar.</small>
        </div>
      )}
      {showStop && <StopButton />}
    </div>
  );
}

export function stopServer() {
  const local = useStore.getState().local;
  const msg = local
    ? 'Sunucu kapatılsın mı? Tekrar açmak için SpaceCast kısayoluna tıkla ya da klasörde "npm start" çalıştır.'
    : 'Sunucu kapatılsın mı? Telefondan tekrar açamazsın; bilgisayardan açman gerekir.';
  if (!confirm(msg)) return;
  api('/api/system/stop', {}).then(() => showToast('Sunucu kapatılıyor…'), (e) => showToast(e.message));
}

function StopButton() {
  return (
    <div>
      <button className="btn sm danger" onClick={stopServer}><Icon name="power" size={14} /> Sunucuyu kapat</button>
    </div>
  );
}

// ------------------------------------------------------------------ ilk açılış sihirbazı

export function Setup() {
  const settings = useStore((s) => s.settings);
  const state = useStore((s) => s.state);
  const local = useStore((s) => s.local);
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState(settings?.userName ?? '');
  const [twinName, setTwinName] = useState(settings?.twinName || '');
  const [draft, setDraft] = useState<Draft>(() => draftFrom(settings));
  const [tested, setTested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const last = local ? 3 : 2;

  const finish = async () => {
    setSaving(true);
    setErr('');
    try {
      await api('/api/setup/save', { userName, twinName, provider: draft });
    } catch (e: any) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="steps">{Array.from({ length: last + 1 }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && (
          <div className="col" style={{ gap: 14 }}>
            <h1 className="glow-title">SpaceCast</h1>
            <p className="lead">Yapay zekâ ajanlarından oluşan kendi ekibini, bir uzay istasyonu gibi yönet.</p>
            <ul className="muted bullets">
              <li>En tepede <b>dijital ikizin</b> var: ona ne istediğini yaz, işi ekiplere dağıtsın.</li>
              <li>Ekipler araştırır, kod ve rapor yazar; para harcamak gibi riskli adımlar <b>senin onayına</b> gelir.</li>
              <li>Telefondan da yönetebilirsin. Her şey senin bilgisayarında çalışır.</li>
            </ul>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={() => setStep(1)}>Başlayalım</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="col" style={{ gap: 16 }}>
            <h2>Tanışalım</h2>
            <label className="field">
              <span>SANA NASIL HİTAP EDELİM?</span>
              <input className="input" value={userName} maxLength={40} placeholder="Adın" autoFocus onChange={(e) => setUserName(e.target.value)} />
            </label>
            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              <label className="field grow">
                <span>DİJİTAL İKİZİNİN ADI</span>
                <input className="input" value={twinName} maxLength={24} placeholder="ör. Nova" onChange={(e) => setTwinName(e.target.value)} />
                <div className="chips">
                  {TWIN_IDEAS.map((n) => <button key={n} className={`chip ${twinName === n ? 'on' : ''}`} onClick={() => setTwinName(n)}>{n}</button>)}
                </div>
                <small className="dim">İkizin seni temsil eder, ekipleri yönetir ve sana rapor verir. Adını sonra Ayarlar'dan değiştirebilirsin.</small>
              </label>
            </div>
            <div className="field">
              <span>{(twinName.trim() || 'İKİZİNİN').toLocaleUpperCase('en')} NASIL GÖRÜNSÜN?</span>
              <AvatarPicker />
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setStep(0)}>Geri</button>
              <span className="grow" />
              <button className="btn primary" disabled={!twinName.trim()} onClick={() => setStep(2)}>Devam</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>Yapay zekâ sağlayıcısı</h2>
            <p className="muted" style={{ margin: 0 }}>{twinName || 'İkizin'} ve ajanlar hangi yapay zekâyla çalışsın? Sonra Ayarlar'dan değiştirebilirsin.</p>
            <ProviderForm draft={draft} setDraft={setDraft} onTested={setTested} />
            <div className="row">
              <button className="btn ghost" onClick={() => setStep(1)}>Geri</button>
              <span className="grow" />
              {!tested && <button className="btn ghost sm" onClick={() => (local ? setStep(3) : finish())}>Test etmeden devam</button>}
              <button className="btn primary" disabled={!tested || saving} onClick={() => (local ? setStep(3) : finish())}>{local ? 'Devam' : 'Bitir'}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>Sunucu</h2>
            <p className="muted" style={{ margin: 0 }}>SpaceCast bu bilgisayarda küçük bir sunucu olarak çalışır. Kapalıyken ajanlar çalışmaz ve telefondan bağlanılamaz.</p>
            <ServerOptions showStop={false} />
            <div className="row">
              <button className="btn ghost" onClick={() => setStep(2)}>Geri</button>
              <span className="grow" />
              <button className="btn primary" disabled={saving} onClick={finish}>{saving ? 'Kaydediliyor…' : 'Üsse gir'}</button>
            </div>
          </div>
        )}
        {err && <div className="note bad">{err}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ayarlar

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const openModal = useStore((s) => s.openModal);
  const [userName, setUserName] = useState(settings?.userName ?? '');
  const [twinName, setTwinName] = useState(settings?.twinName ?? '');
  const [draft, setDraft] = useState<Draft>(() => draftFrom(settings));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await api('/api/setup/save', { userName, twinName, provider: draft });
      showToast('Ayarlar kaydedildi');
      openModal(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Ayarlar"
      onClose={() => openModal(null)}
      footer={
        <>
          {err && <span className="err-text grow">{err}</span>}
          <button className="btn ghost" onClick={() => openModal(null)}>Vazgeç</button>
          <button className="btn primary" disabled={saving || !twinName.trim()} onClick={save}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      }
    >
      <section className="col" style={{ gap: 10 }}>
        <h3 className="sec-h">İsimler</h3>
        <div className="row wrap" style={{ gap: 10 }}>
          <label className="field grow"><span>SENİN ADIN</span><input className="input" value={userName} maxLength={40} onChange={(e) => setUserName(e.target.value)} /></label>
          <label className="field grow"><span>İKİZİNİN ADI</span><input className="input" value={twinName} maxLength={24} onChange={(e) => setTwinName(e.target.value)} /></label>
        </div>
      </section>
      <section className="col" style={{ gap: 10 }}>
        <h3 className="sec-h">İkizin karakteri <small className="dim">· seçince hemen değişir</small></h3>
        <AvatarPicker />
      </section>
      <section className="col" style={{ gap: 10 }}>
        <h3 className="sec-h">Arka plan <small className="dim">· bu cihazda, seçince hemen değişir</small></h3>
        <SpacePicker />
      </section>
      <section className="col" style={{ gap: 10 }}>
        <h3 className="sec-h">Yapay zekâ sağlayıcısı</h3>
        <ProviderForm draft={draft} setDraft={setDraft} onTested={() => {}} />
      </section>
      <section className="col" style={{ gap: 10 }}>
        <h3 className="sec-h">Sunucu</h3>
        <ServerOptions />
      </section>
      <section className="col" style={{ gap: 10 }}>
        <h3 className="sec-h">Telefon</h3>
        <div><button className="btn sm" onClick={() => openModal({ kind: 'connect' })}><Icon name="phone" size={14} /> Telefondan bağlan</button></div>
      </section>
    </Modal>
  );
}

// ------------------------------------------------------------------ uzaktan giriş

export function LoginScreen() {
  const [code, setCode] = useState('');
  return (
    <div className="setup-screen">
      <form className="setup-card col" style={{ gap: 14, maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); if (code.trim()) setKey(code.trim()); }}>
        <h1 className="glow-title">SpaceCast</h1>
        <p className="muted" style={{ margin: 0 }}>
          Bu üsse girmek için erişim kodu gerekiyor. Kodu, SpaceCast'in çalıştığı bilgisayarda <b>Ayarlar → Telefondan bağlan</b> bölümündeki bağlantıda (<span className="mono">?key=</span> sonrası) bulursun. QR kodu okutursan kod gerekmez.
        </p>
        <label className="field">
          <span>ERİŞİM KODU</span>
          <input className="input" value={code} autoFocus autoComplete="off" onChange={(e) => setCode(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!code.trim()}>Giriş yap</button>
      </form>
    </div>
  );
}
