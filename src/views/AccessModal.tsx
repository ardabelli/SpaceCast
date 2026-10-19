// Dijital ikize ve ajanlara bilgisayardaki klasörleri açma ekranı.

import { useState } from 'react';
import { Icon } from '../icons.tsx';
import { useAppState, useStore, useTwinName } from '../store.ts';
import { Modal } from '../ui.tsx';

export function AccessModal() {
  const s = useAppState();
  const twinName = useTwinName();
  const home = useStore((x) => x.home);
  const { dispatch, openModal } = useStore.getState();
  const [path, setPath] = useState('');
  const [mode, setMode] = useState<'read' | 'write'>('read');

  const quick = [
    { label: 'Masaüstü', path: '~/Desktop' },
    { label: 'Belgeler', path: '~/Documents' },
    { label: 'İndirilenler', path: '~/Downloads' },
  ];
  const shown = (p: string) => (home && p.startsWith(home) ? '~' + p.slice(home.length) : p);

  const add = (p = path) => {
    if (!p.trim()) return;
    dispatch({ type: 'grant/add', grant: { id: '', path: p.trim(), mode } });
    setPath('');
  };

  return (
    <Modal title="Dosya erişimi" onClose={() => openModal(null)}>
      <p className="muted" style={{ margin: 0 }}>
        {twinName} ve ajanlar yalnızca burada açtığın klasörleri görebilir. "Sadece okuma" klasörlerinde hiçbir dosya değiştirilemez;
        "okuma + yazma" klasörlerine dosya yazabilirler. Gerçek modda geçerlidir.
      </p>

      <div className="col" style={{ gap: 6 }}>
        {s.grants.length === 0 && <div className="dim">Henüz açık klasör yok.</div>}
        {s.grants.map((g) => (
          <div key={g.id} className="grant">
            <span className="grant-ico"><Icon name="folder" size={16} /></span>
            <span className="grow ellipsis mono" title={g.path}>{shown(g.path)}</span>
            <span className={`badge ${g.mode === 'write' ? 'warn' : ''}`}>{g.mode === 'write' ? 'Okuma + yazma' : 'Sadece okuma'}</span>
            <button className="btn sm ghost" onClick={() => dispatch({ type: 'grant/remove', id: g.id })}>Kaldır</button>
          </div>
        ))}
      </div>

      <div className="field">
        <span>Klasör ekle</span>
        <div className="row">
          <input
            className="input mono"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="~/Desktop/Projelerim"
          />
          <button className="btn primary" disabled={!path.trim()} onClick={() => add()}>Ekle</button>
        </div>
        <div className="row wrap">
          {quick.map((q) => (
            <button key={q.path} className="chip" onClick={() => add(q.path)}>+ {q.label}</button>
          ))}
          <span className="grow" />
          <div className="seg">
            <button className={mode === 'read' ? 'on' : ''} onClick={() => setMode('read')}>Sadece okuma</button>
            <button className={mode === 'write' ? 'on' : ''} onClick={() => setMode('write')}>Okuma + yazma</button>
          </div>
        </div>
      </div>

      <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
        Güvenlik için sistem klasörleri, ev klasörünün tamamı ve anahtar/ayar klasörleri (Library, .ssh…) açılamaz. macOS ilk seferde
        Masaüstü/Belgeler için izin isteyebilir.
      </p>
    </Modal>
  );
}
