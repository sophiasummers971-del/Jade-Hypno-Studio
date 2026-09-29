import { describe, expect, it } from 'vitest';
import { BrowserSpeechEngine } from './BrowserSpeechEngine';
describe('BrowserSpeechEngine capability', () => {
  it('fails gracefully without speech synthesis', async () => {
    const engine = new BrowserSpeechEngine({
      setTimeout: window.setTimeout.bind(window),
    } as unknown as Window);
    expect(engine.supported).toBe(false);
    expect(await engine.voices()).toEqual([]);
    await expect(
      engine.speak([{ type: 'speech', text: 'x' }], {
        voiceId: '',
        rate: 1,
        pitch: 0,
        volume: 1,
      }),
    ).rejects.toThrow(/not available/i);
  });
});
