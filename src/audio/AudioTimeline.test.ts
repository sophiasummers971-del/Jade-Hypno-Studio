import { describe, expect, it } from 'vitest';
import { estimateNarrationSeconds, parseNarration } from './AudioTimeline';
describe('audio timeline narration parser', () => {
  it('keeps plain narration', () =>
    expect(parseNarration('hello world')).toEqual([
      { type: 'speech', text: 'hello world' },
    ]));
  it('parses a single explicit pause without speaking syntax', () =>
    expect(parseNarration('hello [pause:3] world')).toEqual([
      { type: 'speech', text: 'hello' },
      { type: 'pause', seconds: 3 },
      { type: 'speech', text: 'world' },
    ]));
  it('supports multiple decimal pauses', () =>
    expect(
      parseNarration('a[pause:0.5]b[pause:2.25]c').filter(
        (x) => x.type === 'pause',
      ),
    ).toEqual([
      { type: 'pause', seconds: 0.5 },
      { type: 'pause', seconds: 2.25 },
    ]));
  it('drops invalid pause directives safely', () =>
    expect(parseNarration('a [pause:nope] b')).toEqual([
      { type: 'speech', text: 'a' },
      { type: 'speech', text: 'b' },
    ]));
  it('includes pauses in duration', () =>
    expect(estimateNarrationSeconds('one two [pause:3]', 60)).toBe(5));
});
