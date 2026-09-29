import { describe, expect, it } from 'vitest';
import {
  createBlock,
  createSessionFromTemplate,
} from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';
import { blockProgress, playerBlocks } from './PlayerTimeline';
describe('PlayerTimeline', () => {
  it('keeps enabled block order and skips disabled blocks', () => {
    const session = createSessionFromTemplate('x', 'blank', defaultSettings);
    const a = createBlock(),
      b = { ...createBlock(), enabled: false },
      c = createBlock();
    session.blocks = [a, b, c];
    expect(playerBlocks(session).map((x) => x.id)).toEqual([a.id, c.id]);
    expect(blockProgress(session, c.id)).toBe(0.5);
  });
  it('handles an empty playable timeline', () => {
    const session = createSessionFromTemplate('x', 'blank', defaultSettings);
    session.blocks = [];
    expect(blockProgress(session, null)).toBe(0);
  });
});
