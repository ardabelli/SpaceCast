// NPC çizimi: piksel sprite sayfasını (2 yürüme karesi) büyütüp gösterir.

import type { CSSProperties } from 'react';
import { themeOf } from '../shared/meta.ts';
import type { Agent, AppState } from '../shared/types.ts';
import { npc, type Sheet } from './pixelart.ts';

/** Ajanın oda teması ve ekip lideri olup olmadığı (kıyafetini belirler). */
export function agentLook(s: AppState, a: Agent) {
  const team = s.teams.find((t) => t.id === a.teamId);
  const lead = !!a.teamId && !s.agents.some((m) => m.id === a.managerId && m.teamId === a.teamId);
  return { theme: themeOf(team), lead };
}

export function sheetFor(s: AppState, a: Agent): Sheet {
  const { theme, lead } = agentLook(s, a);
  return npc(a.id, a.kind, theme, lead, a.color);
}

export function Npc({ sheet, scale = 3, moving, className, style }: { sheet: Sheet; scale?: number; moving?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`npc ${moving ? 'moving' : ''} ${className ?? ''}`}
      style={{
        width: sheet.w * scale,
        height: sheet.h * scale,
        backgroundImage: `url(${sheet.url})`,
        backgroundSize: `${sheet.w * sheet.frames * scale}px ${sheet.h * scale}px`,
        ['--fw' as string]: `${sheet.w * scale}px`,
        ...style,
      }}
    />
  );
}

export function Prop({ sheet, scale = 3, className }: { sheet: Sheet; scale?: number; className?: string }) {
  return <img className={`prop ${className ?? ''}`} src={sheet.url} alt="" width={sheet.w * scale} height={sheet.h * scale} />;
}
