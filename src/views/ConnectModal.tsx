import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { Modal } from '../ui.tsx';

/** Tailscale adresleri 100.64.0.0/10 aralığındadır. */
function isTailscale(u: string) {
  const [a, b] = new URL(u).hostname.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function ConnectModal() {
  const lanUrls = useStore((s) => s.lanUrls);
  const openModal = useStore((s) => s.openModal);
  // Tailscale varsa önce o: Wi‑Fi'dan bağımsız, her yerden çalışır.
  const urls = [...lanUrls].sort((a, b) => Number(isTailscale(b)) - Number(isTailscale(a)));
  const [idx, setIdx] = useState(0);
  const [qr, setQr] = useState('');
  const url = urls[idx];
  const ts = url ? isTailscale(url) : false;

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr);
  }, [url]);

  return (
    <Modal title="Telefondan kontrol et" onClose={() => openModal(null)}>
      {url ? (
        <>
          {urls.length > 1 && (
            <div className="seg" style={{ alignSelf: 'center' }}>
              {urls.map((u, i) => (
                <button key={u} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)}>
                  {isTailscale(u) ? 'Tailscale · her yerden' : 'Aynı Wi‑Fi'}
                </button>
              ))}
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div className="qr">{qr && <img src={qr} width={220} height={220} alt="Bağlantı QR kodu" />}</div>
          </div>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {ts ? (
              <li>Telefonda <b>Tailscale açık</b> olsun (Wi‑Fi ya da mobil veri fark etmez). Bilgisayar da açık ve Tailscale'e bağlı olmalı.</li>
            ) : (
              <li>Telefonun bu bilgisayarla <b>aynı Wi‑Fi</b> ağında olsun.</li>
            )}
            <li>Kamerayla QR kodu okut, açılan sayfaya gir.</li>
            <li>
              iPhone: Paylaş → <b>Ana Ekrana Ekle</b>. Android: ⋮ → <b>Ana ekrana ekle</b>. Artık ayrı bir uygulama gibi açılır.
            </li>
          </ol>
          <div className="mono dim" style={{ wordBreak: 'break-all' }}>{url}</div>
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Bağlantıdaki anahtar, başkalarının üssünü yönetmesini engeller; kimseyle paylaşma.
            {!ts && ' Evden uzaktayken bağlanmak için bilgisayara ve telefona Tailscale kur.'}
          </p>
        </>
      ) : (
        <p className="muted">Ağ adresi bulunamadı. Bilgisayarın bir Wi‑Fi ağına ya da Tailscale'e bağlı olduğundan emin ol.</p>
      )}
    </Modal>
  );
}
