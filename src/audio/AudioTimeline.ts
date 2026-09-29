import type { Session, SessionBlock } from '../domain/schema';
import type { NarrationPart } from './types';

const PAUSE = /\[pause\s*:\s*([^\]]+)\]/gi;
const MAX_PAUSE_SECONDS = 300;

export function parseNarration(input: string): NarrationPart[] {
  const parts: NarrationPart[] = [];
  let cursor = 0;
  for (const match of input.matchAll(PAUSE)) {
    const index = match.index ?? 0;
    const before = input.slice(cursor, index).trim();
    if (before) parts.push({ type: 'speech', text: before });
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_PAUSE_SECONDS)
      parts.push({ type: 'pause', seconds });
    cursor = index + match[0].length;
  }
  const rest = input.slice(cursor).trim();
  if (rest) parts.push({ type: 'speech', text: rest });
  return parts;
}

export function estimateNarrationSeconds(text: string, wordsPerMinute = 150): number {
  return parseNarration(text).reduce((total, part) => {
    if (part.type === 'pause') return total + part.seconds;
    const words = part.text.trim() ? part.text.trim().split(/\s+/).length : 0;
    return total + (words / Math.max(1, wordsPerMinute)) * 60;
  }, 0);
}

export function playableBlocks(session: Session): SessionBlock[] {
  return session.blocks.filter((block) => block.enabled && Boolean(block.narration.trim()));
}
