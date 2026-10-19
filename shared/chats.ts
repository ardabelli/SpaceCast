// İkizle sohbetler: her sekme ayrı bir konuşma. Sistem mesajları (görev raporu, onay soruları)
// görevin açıldığı sohbete, o yoksa en son kullanılan sohbete düşer.

import type { AppState, ChatMsg, Conversation } from './types.ts';

export const NEW_CHAT_TITLE = 'Yeni sohbet';
const MAX_MESSAGES = 300;
const MAX_CHATS = 40;

export function newChat(id: string, title = NEW_CHAT_TITLE, now = Date.now()): Conversation {
  return { id, title, createdAt: now, updatedAt: now, messages: [] };
}

/** En son kullanılan sohbet; hiç yoksa yenisini açar. */
export function latestChat(s: AppState): Conversation {
  if (!s.chats.length) s.chats.push(newChat(`k-${Date.now().toString(36)}`));
  return s.chats.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}

export function chatOf(s: AppState, id?: string): Conversation {
  return (id && s.chats.find((c) => c.id === id)) || latestChat(s);
}

/** İlk kullanıcı mesajından kısa bir başlık. */
function titleFrom(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 32 ? t.slice(0, 31).trimEnd() + '…' : t || NEW_CHAT_TITLE;
}

export function pushMessage(c: Conversation, msg: ChatMsg) {
  c.messages.push(msg);
  if (c.messages.length > MAX_MESSAGES) c.messages.splice(0, c.messages.length - MAX_MESSAGES);
  c.updatedAt = msg.ts;
  if (c.title === NEW_CHAT_TITLE && msg.from === 'user' && msg.text) c.title = titleFrom(msg.text);
}

/** Çok sohbet birikirse en eski (meşgul olmayan) sohbetleri bırak. */
export function trimChats(s: AppState) {
  while (s.chats.length > MAX_CHATS) {
    const old = [...s.chats].filter((c) => !c.busy).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!old) break;
    s.chats = s.chats.filter((c) => c !== old);
  }
}

export const anyBusy = (s: AppState) => s.chats.some((c) => c.busy);
