import { describe, expect, it } from 'vitest';
import {
  createBlock,
  createSessionFromTemplate,
} from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';
import { visualTimeline } from './VisualTimeline';
describe('visualTimeline', () => {
  it('reuses the script/audio duration model and skips disabled blocks', () => {
    const s = createSessionFromTemplate('x', 'blank', defaultSettings);
    const a = createBlock();
    a.narration = 'one two three';
    a.manualDurationOverride = 4;
    const b = createBlock();
    b.enabled = false;
    b.manualDurationOverride = 9;
    s.blocks = [a, b];
    const t = visualTimeline(s, 150);
    expect(t).toHaveLength(1);
    expect(t[0].end).toBe(4);
  });
});
