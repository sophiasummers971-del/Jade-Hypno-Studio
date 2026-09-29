import type { Session, SessionBlock } from '../domain/schema';
export const playerBlocks = (session: Session): SessionBlock[] =>
  session.blocks.filter((block) => block.enabled);
export function blockProgress(session: Session, blockId: string | null) {
  const blocks = playerBlocks(session);
  if (!blocks.length || !blockId) return 0;
  const index = blocks.findIndex((block) => block.id === blockId);
  return index < 0 ? 0 : index / blocks.length;
}
