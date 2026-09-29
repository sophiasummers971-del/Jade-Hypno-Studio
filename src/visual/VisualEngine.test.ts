import { describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../audio/AudioEngine';
import type { AudioEngineSnapshot } from '../audio/types';
import { createBlock, createSessionFromTemplate } from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';
import type { VisualSnapshot } from './types';
import { VisualEngine } from './VisualEngine';

describe('VisualEngine', () => {
  it('follows audio snapshots rather than creating a second playback clock', async () => {
    let listener: (snapshot: AudioEngineSnapshot) => void = () => undefined;
    const audioMock = {
      subscribe: vi.fn((next: (snapshot: AudioEngineSnapshot) => void) => {
        listener = next;
        next({
          state: 'idle',
          currentBlockId: null,
          elapsedSeconds: 0,
          error: null,
        });
        return () => undefined;
      }),
      playSession: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    } satisfies Pick<
      AudioEngine,
      'subscribe' | 'playSession' | 'pause' | 'resume' | 'stop'
    >;
    const audio = audioMock as unknown as AudioEngine;
    const engine = new VisualEngine(audio);
    const session = createSessionFromTemplate('x', 'blank', defaultSettings);
    const block = createBlock();
    block.narration = 'caption';
    session.blocks = [block];

    await engine.playSession(session);
    listener({
      state: 'playing',
      currentBlockId: block.id,
      elapsedSeconds: 3,
      error: null,
    });

    let snapshot: VisualSnapshot | undefined;
    engine.subscribe((next) => {
      snapshot = next;
    })();

    expect(snapshot?.currentBlockId).toBe(block.id);
    expect(snapshot?.caption).toBe('caption');
    engine.pause();
    expect(audioMock.pause).toHaveBeenCalled();
    engine.stop();
    expect(audioMock.stop).toHaveBeenCalled();
    engine.dispose();
  });
});
