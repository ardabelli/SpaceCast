import { useState } from 'react';
import { Icon, type IconName } from '../icons.tsx';
import { uid } from '../../shared/engine.ts';
import { useAppState, useStore } from '../store.ts';
import { Modal } from '../ui.tsx';

const TEMPLATES = [
  { icon: 'code' as IconName, owner: 'a-mimar', title: 'Yapılacaklar uygulaması geliştir', description: 'Kullanıcı girişli, mobil uyumlu basit bir todo uygulaması. Testleri yazılsın ve yayına alınsın.' },
  { icon: 'trendingUp' as IconName, owner: 'a-tuccar', title: 'İkinci el pazarda kâr fırsatı bul', description: 'Ucuza satılan ikinci el kulaklıkları bul, piyasa fiyatıyla karşılaştır, kârlı olanı al ve yeniden sat.' },
  { icon: 'book' as IconName, owner: 'a-editor', title: 'Rakip analizi raporu yaz', description: 'Sektördeki 5 rakibin fiyatlarını ve özelliklerini araştır, karşılaştırmalı bir rapor hazırla.' },
  { icon: 'users' as IconName, owner: 'a-twin', title: 'Yeni ürün lansmanı', description: 'Tüm ordu: uygulamayı geliştir, pazarı araştır, tanıtım metnini yaz.' },
];

export function MissionModal({ ownerId }: { ownerId?: string }) {
  const s = useAppState();
  const { dispatch, openModal, go, selectMission } = useStore.getState();
  const fallback = s.agents.find((a) => a.kind === 'commander')?.id ?? s.agents[0]?.id ?? '';
  const [owner, setOwner] = useState(ownerId ?? fallback);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const close = () => openModal(null);

  const reports = (id: string) => s.agents.filter((a) => a.managerId === id).length;

  const submit = () => {
    if (!title.trim() || !owner) return;
    const id = uid('m-');
    dispatch({ type: 'mission/create', mission: { id, title: title.trim(), description: description.trim(), ownerId: owner } });
    selectMission(id);
    go('missions');
    close();
  };

  return (
    <Modal
      title="Yeni görev"
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>Vazgeç</button>
          <button className="btn primary" disabled={!title.trim() || !owner} onClick={submit}>Görevi başlat</button>
        </>
      }
    >
      {!title && (
        <div className="templates">
          {TEMPLATES.filter((t) => !ownerId || t.owner === ownerId || ownerId === fallback).map((t) => (
            <button
              key={t.title}
              className="template"
              onClick={() => {
                setTitle(t.title);
                setDescription(t.description);
                if (!ownerId && s.agents.some((a) => a.id === t.owner)) setOwner(t.owner);
              }}
            >
              <span className="dim"><Icon name={t.icon} size={16} /></span>
              <span className="grow">{t.title}</span>
              <span className="dim">→</span>
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span>Görev</span>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ne yapılsın?" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </label>
      <label className="field">
        <span>Detaylar</span>
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Hedef, kısıtlar, bütçe…" />
      </label>
      <label className="field">
        <span>Kime verilsin?</span>
        <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
          {s.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.role}{reports(a.id) ? ` (${reports(a.id)} kişilik ekibe dağıtır)` : ''}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}
