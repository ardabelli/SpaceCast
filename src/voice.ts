// Tarayıcının kendi konuşma tanıma (sesten yazıya) ve konuşma sentezi (yazıdan sese) özellikleri.

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function Ctor(): (new () => Recognition) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupport(): { ok: true } | { ok: false; reason: string } {
  if (!window.isSecureContext) {
    return { ok: false, reason: 'Mikrofon sadece güvenli (HTTPS) bağlantıda çalışır. Telefonda "Telefona bağlan" ekranındaki güvenli bağlantıyı kullan.' };
  }
  if (!Ctor()) return { ok: false, reason: 'Bu tarayıcı konuşma tanımayı desteklemiyor. Chrome veya Safari kullan.' };
  return { ok: true };
}

/** Bir kez dinler; ara sonuçları ve bittiğinde son metni bildirir. */
export function listen(handlers: { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError: (msg: string) => void }) {
  const C = Ctor();
  if (!C) return null;
  const r = new C();
  r.lang = 'tr-TR';
  r.interimResults = true;
  r.continuous = false;
  let finalText = '';
  r.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    handlers.onInterim((finalText + interim).trim());
  };
  r.onerror = (e: any) => {
    const map: Record<string, string> = {
      'not-allowed': 'Mikrofon izni verilmedi.',
      'no-speech': 'Ses duyulmadı, tekrar dene.',
      network: 'Konuşma tanıma için internet gerekiyor.',
    };
    if (e.error !== 'aborted') handlers.onError(map[e.error] ?? `Konuşma tanıma hatası: ${e.error}`);
  };
  r.onend = () => {
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    handlers.onEnd();
  };
  r.start();
  return r;
}

function plain(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/https?:\/\/\S+/g, 'bağlantı')
    .replace(/\/Users\/\S+/g, 'klasör')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .slice(0, 1200);
}

export const ttsSupported = () => 'speechSynthesis' in window;

export function speak(text: string) {
  if (!ttsSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(plain(text));
  u.lang = 'tr-TR';
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('tr'));
  if (voice) u.voice = voice;
  u.rate = 1.05;
  synth.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
