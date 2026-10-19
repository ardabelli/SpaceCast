// Dijital ikizle sohbet: emir ver, durum sor, onayları buradan ver.

import { useEffect, useRef, useState } from 'react';
import { agentStatus, uid } from '../../shared/engine.ts';
import { twinOf } from '../../shared/twin.ts';
import type { Attachment, ChatMsg } from '../../shared/types.ts';
import { Icon } from '../icons.tsx';
import { openFloating } from '../widget.tsx';
import { Npc } from '../npc.tsx';
import { knight } from '../pixelart.ts';
import { fileUrl, getKey, showToast, useAppState, useStore, useTwinName } from '../store.ts';
import { clock } from '../ui.tsx';
import { listen, speak, stopSpeaking, sttSupport, ttsSupported } from '../voice.ts';

const SUGGESTIONS = [
  "Etsy'de satılacak kârlı bir ürün bul ve sat",
  'Bana bir yapılacaklar uygulaması yap',
  'Rakiplerimizi araştırıp rapor yaz',
  'Durum raporu ver',
];

const TTS_KEY = 'army-tts';

async function shrinkImage(file: File): Promise<Blob> {
  // Fotoğrafları 1600 px'e küçült: yükleme hızlanır, Claude daha az token harcar.
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

async function upload(file: File): Promise<Attachment> {
  const body = await shrinkImage(file);
  const name = body !== file ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'x-file-name': encodeURIComponent(name), 'x-key': getKey(), 'content-type': body.type || 'application/octet-stream' },
    body,
  });
  if (!r.ok) throw new Error(r.status === 413 ? 'Dosya 30 MB sınırını aşıyor' : `Yükleme başarısız (${r.status})`);
  return r.json();
}

export function Chat({ docked, widget }: { docked?: boolean; widget?: boolean }) {
  const s = useAppState();
  const { dispatch, go, selectMission, openModal } = useStore.getState();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [listening, setListening] = useState(false);
  const [tts, setTts] = useState(() => { try { return localStorage.getItem(TTS_KEY) === '1'; } catch { return false; } });
  const rec = useRef<ReturnType<typeof listen>>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Yazı kutusu içeriğe göre büyür (en fazla ~8 satır), sonra kendi içinde kayar.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Boşken tek satır (uzun yer tutucu metin kutuyu büyütmesin); yazdıkça büyür.
    el.style.height = 'auto';
    el.style.height = text ? Math.min(el.scrollHeight, 200) + 'px' : '';
  }, [text]);
  const list = useRef<HTMLDivElement>(null);
  const twin = twinOf(s);
  const twinName = useTwinName();
  const last = s.chat.at(-1);
  const first = useRef(true);
  const spoken = useRef(last?.id);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [last?.id, s.twinBusy]);

  // İkizin yeni cevabını sesli oku: hoparlör açıksa ya da kullanıcı son mesajı sesle söylediyse.
  useEffect(() => {
    if (!last || last.id === spoken.current) return;
    spoken.current = last.id;
    if (last.from !== 'twin' || last.approvalId) return;
    const prevUser = [...s.chat].reverse().find((c) => c.from === 'user');
    if (tts || prevUser?.voice) speak(last.text);
  }, [last?.id]);

  const send = (t = text, voice = false) => {
    if (!t.trim() && !files.length) return;
    stopSpeaking();
    dispatch({ type: 'chat/send', id: uid('c-'), text: t.trim(), attachments: files.length ? files : undefined, voice });
    setText('');
    setFiles([]);
  };

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const arr = [...list].slice(0, 10);
    setUploading((n) => n + arr.length);
    for (const f of arr) {
      try {
        const a = await upload(f);
        setFiles((x) => [...x, a]);
      } catch (e) {
        showToast(String((e as Error).message));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const mic = () => {
    if (listening) { rec.current?.stop(); return; }
    const sup = sttSupport();
    if (!sup.ok) { showToast(sup.reason); return; }
    stopSpeaking();
    setListening(true);
    rec.current = listen({
      onInterim: (t) => setText(t),
      onFinal: (t) => send(t, true),
      onEnd: () => setListening(false),
      onError: (m) => showToast(m),
    });
  };

  const toggleTts = () => {
    const v = !tts;
    setTts(v);
    try { localStorage.setItem(TTS_KEY, v ? '1' : '0'); } catch { /* yok say */ }
    if (!v) stopSpeaking();
  };

  const status = twin ? agentStatus(s, twin.id) : 'idle';
  const thinking = !!s.twinBusy;

  return (
    <div className={`chat ${docked ? 'docked' : ''} ${widget ? 'widget' : ''}`}>
      <div className="chat-h">
        {twin && (
          <span className="chat-av">
            <Npc sheet={knight()} scale={2} className="portrait" />
          </span>
        )}
        <div className="grow">
          <div className="chat-name">{twinName}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>
            Dijital ikiz · 
            {listening ? 'dinliyor' : thinking ? 'düşünüyor' : status === 'idle' ? 'çevrimiçi' : status === 'waiting' ? 'kararını bekliyor' : 'orduyu yönetiyor'}
          </div>
        </div>
        {ttsSupported() && (
          <button className={`icon-btn ${tts ? 'on' : ''}`} onClick={toggleTts} title={tts ? 'Sesli yanıt açık' : 'Sesli yanıt kapalı'}>
            <Icon name={tts ? 'volume' : 'volumeOff'} />
          </button>
        )}
        <button className="icon-btn" onClick={() => openModal({ kind: 'access' })} title="Dosya erişimi">
          <Icon name="folder" />{s.grants.length > 0 && <small>{s.grants.length}</small>}
        </button>
        {widget ? (
          <button className="icon-btn" onClick={() => { window.focus(); go('twin'); }} title="SpaceCast'i aç"><Icon name="expand" size={16} /></button>
        ) : docked ? (
          <>
            <button className="icon-btn" onClick={() => openFloating()} title="Uçan pencerede aç"><Icon name="float" size={17} /></button>
            <button className="icon-btn" onClick={() => go('twin')} title="Tam ekran"><Icon name="expand" size={16} /></button>
          </>
        ) : (
          <button className="btn sm ghost" onClick={() => confirm('Sohbet geçmişi silinsin mi?') && dispatch({ type: 'chat/clear' })}>Temizle</button>
        )}
      </div>

      <div className="chat-list" ref={list}>
        {s.chat.map((m) => (
          <Message key={m.id} m={m} onMission={(id) => { selectMission(id); go('missions'); }} />
        ))}
        {thinking && (
          <div className="msg twin">
            <div className="msg-meta">{twinName}</div>
            <div className="msg-body blink">düşünüyor…</div>
          </div>
        )}
      </div>

      {s.chat.length < 4 && !files.length && (
        <div className="chat-sugg">
          {SUGGESTIONS.map((t) => (
            <button key={t} className="chip" onClick={() => send(t)}>{t}</button>
          ))}
        </div>
      )}

      {(files.length > 0 || uploading > 0) && (
        <div className="pending-files">
          {files.map((f) => (
            <span key={f.id} className="pfile">
              {f.type.startsWith('image/') ? <img src={fileUrl(f.id)} alt="" /> : <span className="pfile-ico"><Icon name="file" size={18} /></span>}
              <span className="ellipsis">{f.name}</span>
              <button onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label="Kaldır"><Icon name="x" size={14} /></button>
            </span>
          ))}
          {uploading > 0 && <span className="pfile dim">Yükleniyor… ({uploading})</span>}
        </div>
      )}

      <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        <button type="button" className="icon-btn" title="Dosya ekle" onClick={() => fileInput.current?.click()}><Icon name="paperclip" /></button>
        <button type="button" className="icon-btn" title="Fotoğraf çek / seç" onClick={() => camInput.current?.click()}><Icon name="camera" /></button>
        <textarea
          ref={box}
          className="input chat-box"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter gönderir, Shift+Enter yeni satır (telefonda klavyenin "gönder" tuşu da gönderir)
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          placeholder={listening ? 'Dinliyorum…' : `${twinName} ile konuş…`}
          enterKeyHint="send"
        />
        <button type="button" className={`icon-btn mic ${listening ? 'live' : ''}`} title={listening ? 'Dinlemeyi bitir' : 'Sesle konuş'} onClick={mic}>
          <Icon name={listening ? 'stop' : 'mic'} />
        </button>
        <button className="btn primary send" disabled={(!text.trim() && !files.length) || uploading > 0} title="Gönder"><Icon name="send" size={16} /><span className="send-lbl">Gönder</span></button>
      </form>
    </div>
  );
}

function Message({ m, onMission }: { m: ChatMsg; onMission: (id: string) => void }) {
  const s = useAppState();
  const dispatch = useStore((x) => x.dispatch);
  const twinName = useTwinName();
  const ap = m.approvalId ? s.approvals.find((a) => a.id === m.approvalId) : null;
  const mission = m.missionId ? s.missions.find((x) => x.id === m.missionId) : null;
  return (
    <div className={`msg ${m.from}`}>
      <div className="msg-meta">
        {m.from === 'twin' ? twinName : 'Sen'}{m.voice && <> · <Icon name="mic" size={11} /></>} · {clock(m.ts)}
        {m.from === 'twin' && ttsSupported() && (
          <button className="say" onClick={() => speak(m.text)} title="Sesli oku"><Icon name="volume" size={12} /></button>
        )}
      </div>
      {m.attachments && m.attachments.length > 0 && (
        <div className="msg-files">
          {m.attachments.map((a) =>
            a.type.startsWith('image/') ? (
              <a key={a.id} href={fileUrl(a.id)} target="_blank" rel="noreferrer"><img src={fileUrl(a.id)} alt={a.name} /></a>
            ) : (
              <a key={a.id} className="fchip" href={fileUrl(a.id)} target="_blank" rel="noreferrer"><Icon name="file" size={15} /> {a.name}</a>
            ),
          )}
        </div>
      )}
      {m.text && <div className="msg-body">{m.from === 'twin' ? <Rich text={m.text} /> : m.text}</div>}
      {ap && (
        <div className="msg-actions">
          {ap.status === 'pending' ? (
            <>
              <button className="btn sm danger" onClick={() => dispatch({ type: 'approval/resolve', id: ap.id, approved: false })}>Reddet</button>
              <button className="btn sm primary" onClick={() => dispatch({ type: 'approval/resolve', id: ap.id, approved: true })}>
                Onayla{ap.amount !== undefined ? ` $${ap.amount}` : ''}
              </button>
            </>
          ) : (
            <span className={`badge ${ap.status === 'approved' ? 'ok' : 'bad'}`}>{ap.status === 'approved' ? 'Onayladın' : 'Reddettin'}</span>
          )}
        </div>
      )}
      {mission && !ap && (
        <button className="msg-link" onClick={() => onMission(mission.id)}>
          ▸ {mission.status === 'done' ? 'Raporu gör' : 'İlerlemeyi izle'}
        </button>
      )}
    </div>
  );
}

/** Claude'un cevaplarındaki basit Markdown'ı (kalın, başlık) güvenli şekilde gösterir. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const h = /^#{1,4}\s+(.*)$/.exec(line);
        const body = (h ? h[1] : line).split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? <b key={j}>{part.slice(2, -2)}</b> : part,
        );
        return (
          <span key={i} className={h ? 'md-h' : undefined}>
            {i > 0 && '\n'}
            {body}
          </span>
        );
      })}
    </>
  );
}
