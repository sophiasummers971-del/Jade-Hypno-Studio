import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import type { AudioMixer } from './AudioMixer';
import type { SpeechEngine } from './SpeechEngine';
import type { NarrationPart, SpeechSettings } from './types';
import { newSession, defaultSettings } from '../domain/schema';
import { createBlock } from '../domain/scriptBuilder';
import { returnNow } from '../safety/returnNow';

class FakeSpeech implements SpeechEngine {
  supported = true;
  calls: NarrationPart[][] = [];
  stopped = 0;
  paused = 0;
  resumed = 0;
  async voices() {
    return [{ id: 'v', name: 'Voice', lang: 'en-GB', default: true }];
  }
  async speak(parts: NarrationPart[], settings: SpeechSettings) {
    void settings;
    this.calls.push(parts);
  }
  pause() {
    this.paused++;
  }
  resume() {
    this.resumed++;
  }
  stop() {
    this.stopped++;
  }
}
function mixer() {
  return {
    ready: vi.fn(async () => {}),
    setLevels: vi.fn(),
    play: vi.fn(async () => {}),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(async () => {}),
    stopAll: vi.fn(),
    fadeOutAll: vi.fn(async () => {}),
  } as unknown as AudioMixer;
}
describe('AudioEngine', () => {
  it('plays a block and strips pause syntax into structured parts', async () => {
    const s = new FakeSpeech(),
      e = new AudioEngine(s, mixer());
    const b = { ...createBlock(), narration: 'hello [pause:1] world' };
    await e.playBlock(b);
    expect(s.calls[0]).toContainEqual({ type: 'pause', seconds: 1 });
    e.dispose();
  });
  it('sequences enabled narrated blocks and skips disabled blocks', async () => {
    const s = new FakeSpeech(),
      e = new AudioEngine(s, mixer());
    const a = { ...createBlock(), narration: 'a' },
      b = { ...createBlock(), narration: 'b', enabled: false };
    const session = { ...newSession('x', defaultSettings), blocks: [a, b] };
    await e.playSession(session);
    expect(s.calls).toHaveLength(1);
    e.dispose();
  });
  it('prevents duplicate play while active', async () => {
    let release!: () => void;
    const s = new FakeSpeech();
    s.speak = vi.fn(() => new Promise<void>((r) => (release = r)));
    const e = new AudioEngine(s, mixer());
    const b = { ...createBlock(), narration: 'a' };
    const first = e.playBlock(b);
    void e.playBlock(b);
    expect(s.speak).toHaveBeenCalledTimes(1);
    release();
    await first;
    e.dispose();
  });
  it('pause resume and stop fan out cleanup', async () => {
    let release!: () => void;
    const s = new FakeSpeech();
    s.speak = vi.fn(() => new Promise<void>((r) => (release = r)));
    const m = mixer(),
      e = new AudioEngine(s, m);
    const b = { ...createBlock(), narration: 'a' };
    const p = e.playBlock(b);
    e.pause();
    await e.resume();
    e.stop();
    expect(s.paused).toBe(1);
    expect(s.resumed).toBe(1);
    expect(m.stopAll).toHaveBeenCalled();
    release();
    await p;
    e.dispose();
  });
 it('RETURN NOW stops speech and mixer through the permanent M3 contract',async()=>{const s=new FakeSpeech(),m=mixer(),e=new AudioEngine(s,m);await returnNow();expect(s.stopped).toBeGreaterThan(0);expect(m.stopAll).toHaveBeenCalled();e.dispose()});
});
