// İkizle sohbet sekmeleri: yeni sohbet aç, sekmeler arasında geç, yeniden adlandır (çift tıkla), sil.

import { useEffect } from 'react';
import { uid } from '../../shared/engine.ts';
import { Icon } from '../icons.tsx';
import { useActiveChat, useAppState, useStore } from '../store.ts';

export function ChatTabs() {
  const s = useAppState();
  const active = useActiveChat();
  const seen = useStore((x) => x.seen);
  const { dispatch, setActiveChat, markSeen } = useStore.getState();
  const chats = [...s.chats].sort((a, b) => a.createdAt - b.createdAt);

  // Açık sohbet görülmüş sayılır; ilk kez görülen sohbetler okunmuş başlar.
  useEffect(() => {
    const marks: Record<string, number> = {};
    for (const c of s.chats) if (seen[c.id] === undefined || (c.id === active.id && seen[c.id] < c.updatedAt)) marks[c.id] = c.updatedAt;
    if (Object.keys(marks).length) markSeen(marks);
  }, [s.chats, active.id]);

  const add = () => {
    // Zaten boş bir sohbet varsa yenisini açma, ona geç
    const empty = s.chats.find((c) => !c.messages.length && !c.busy);
    if (empty) { setActiveChat(empty.id); return; }
    const id = uid('k-');
    dispatch({ type: 'chat/new', id });
    setActiveChat(id);
  };

  const rename = (id: string, title: string) => {
    const t = prompt('Sohbetin adı', title);
    if (t !== null && t.trim()) dispatch({ type: 'chat/rename', id, title: t });
  };

  const remove = (id: string, title: string) => {
    if (!confirm(`"${title}" sohbeti silinsin mi? Açtığı görevler devam eder.`)) return;
    const next = chats.filter((c) => c.id !== id).at(-1);
    dispatch({ type: 'chat/delete', id });
    if (next) setActiveChat(next.id);
  };

  return (
    <div className="chat-tabs" role="tablist">
      {chats.map((c) => {
        const on = c.id === active.id;
        const unread = !on && c.messages.at(-1)?.from === 'twin' && c.updatedAt > (seen[c.id] ?? c.updatedAt);
        return (
          <div key={c.id} role="tab" aria-selected={on} className={`ctab ${on ? 'on' : ''}`} title={`${c.title} · çift tıkla: yeniden adlandır`}
            onClick={() => setActiveChat(c.id)} onDoubleClick={() => rename(c.id, c.title)}>
            {c.busy ? <i className="ctab-dot busy" /> : unread ? <i className="ctab-dot" /> : null}
            <span className="ellipsis">{c.title}</span>
            {on && chats.length > 1 && (
              <button className="ctab-x" title="Sohbeti sil" onClick={(e) => { e.stopPropagation(); remove(c.id, c.title); }}><Icon name="x" size={12} /></button>
            )}
          </div>
        );
      })}
      <button className="ctab-add" title="Yeni sohbet" onClick={add}><Icon name="plus" size={15} /></button>
    </div>
  );
}
