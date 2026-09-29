import { describe, expect, it } from 'vitest';
import { createBlock } from '../domain/scriptBuilder';
import { captionForBlock } from './CaptionEngine';
describe('captionForBlock', () => {
  it('supports full, none, selected and emphasis modes', () => {
    const block=createBlock(); block.narration='Hello **bright world** [pause:2] again';
    expect(captionForBlock(block)).toBe('Hello **bright world** again');
    block.captionSettings.mode='none'; expect(captionForBlock(block)).toBe('');
    block.captionSettings.mode='selected-phrases'; block.captionSettings.selectedPhrases=['Hello','again']; expect(captionForBlock(block)).toBe('Hello · again');
    block.captionSettings.mode='emphasis-only'; expect(captionForBlock(block)).toBe('bright world');
  });
});
