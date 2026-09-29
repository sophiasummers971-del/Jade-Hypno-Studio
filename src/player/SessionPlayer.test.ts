import { describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../audio/AudioEngine';
import type { AudioEngineSnapshot } from '../audio/types';
import {
  createBlock,
  createSessionFromTemplate,
} from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';
import { returnNow } from '../safety/returnNow';
import { SessionPlayer } from './SessionPlayer';
function harness() {
  let listener: (s: AudioEngineSnapshot) => void = () => undefined;
  const audio = {
    subscribe: vi.fn((next: (s: AudioEngineSnapshot) => void) => {
      listener = next;
      next({
        state: 'idle',
        currentBlockId: null,
        elapsedSeconds: 0,
        error: null,
      });
      return () => undefined;
    }),
    playSession: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(async () => {}),
    stop: vi.fn(),
  } satisfies Pick<
    AudioEngine,
    'subscribe' | 'playSession' | 'pause' | 'resume' | 'stop'
  >;
  return { audio, emit: (s: AudioEngineSnapshot) => listener(s) };
}
describe('SessionPlayer', () => {
  it('moves deterministically through ready playing paused resumed and completed', async () => {
    const h = harness(),
      p = new SessionPlayer(h.audio as unknown as AudioEngine);
    const session = createSessionFromTemplate('x', 'blank', defaultSettings),
      block = createBlock();
    block.narration = 'hello';
    session.blocks = [block];
    let state = '';
    p.subscribe((s) => {
      state = s.state;
    });
    p.prepare(session);
    expect(state).toBe('ready');
    const start = p.start();
    h.emit({
      state: 'playing',
      currentBlockId: block.id,
      elapsedSeconds: 1,
      error: null,
    });
    expect(state).toBe('playing');
    p.pause();
    expect(h.audio.pause).toHaveBeenCalled();
    h.emit({
      state: 'paused',
      currentBlockId: block.id,
      elapsedSeconds: 1,
      error: null,
    });
    expect(state).toBe('paused');
    await p.resume();
    expect(h.audio.resume).toHaveBeenCalled();
    h.emit({
      state: 'playing',
      currentBlockId: block.id,
      elapsedSeconds: 2,
      error: null,
    });
    h.emit({
      state: 'idle',
      currentBlockId: null,
      elapsedSeconds: 3,
      error: null,
    });
    expect(state).toBe('completed');
    await start;
    p.dispose();
  });
  it('normal stop cleans audio and returns ready while RETURN NOW resets player state', async () => {
    const h = harness(),
      p = new SessionPlayer(h.audio as unknown as AudioEngine);
    const session = createSessionFromTemplate('x', 'blank', defaultSettings);
    session.blocks = [createBlock()];
    let state = '';
    p.subscribe((s) => {
      state = s.state;
    });
    p.prepare(session);
    void p.start();
    h.emit({
      state: 'playing',
      currentBlockId: session.blocks[0].id,
      elapsedSeconds: 0,
      error: null,
    });
    p.stop();
    expect(h.audio.stop).toHaveBeenCalled();
    expect(state).toBe('ready');
    await returnNow();
    expect(state).toBe('idle');
    p.dispose();
  });
  it('enters a recoverable error state and retry returns ready', () => {
    const h = harness(),
      p = new SessionPlayer(h.audio as unknown as AudioEngine);
    const session = createSessionFromTemplate('x', 'blank', defaultSettings);
    session.blocks = [createBlock()];
    let state = '';
    p.subscribe((s) => {
      state = s.state;
    });
    p.prepare(session);
    void p.start();
    h.emit({
      state: 'error',
      currentBlockId: null,
      elapsedSeconds: 0,
      error: 'decode failed',
    });
    expect(state).toBe('error');
    p.retry();
    expect(state).toBe('ready');
    p.dispose();
  });
});
