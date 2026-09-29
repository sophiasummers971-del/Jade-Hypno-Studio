import type { AudioEngine } from '../audio/AudioEngine';
import type { Session } from '../domain/schema';
import type { VisualEngine } from '../visual/VisualEngine';
import { registerReturnNowHooks } from '../safety/returnNow';
import { captionForBlock } from '../visual/CaptionEngine';
import { blockProgress, playerBlocks } from './PlayerTimeline';
import type { PlayerSnapshot, PlayerState } from './types';
type Listener = (snapshot: PlayerSnapshot) => void;
export class SessionPlayer {
  private snapshot: PlayerSnapshot = {
    state: 'idle',
    currentBlockId: null,
    elapsedSeconds: 0,
    progress: 0,
    caption: '',
    error: null,
  };
  private listeners = new Set<Listener>();
  private session: Session | null = null;
  private started = false;
  private unregister: () => void;
  private unsubscribe: () => void;
  constructor(
    readonly audio: AudioEngine,
    private readonly visual?: VisualEngine,
  ) {
    this.unsubscribe = audio.subscribe((a) => {
      const session = this.session;
      const block = session?.blocks.find(
        (item) => item.id === a.currentBlockId,
      );
      if (a.state === 'error') {
        this.set({
          state: 'error',
          error: a.error ?? 'Playback failed.',
          currentBlockId: a.currentBlockId,
        });
        return;
      }
      if (
        a.state === 'playing' ||
        a.state === 'loading' ||
        a.state === 'paused'
      ) {
        const state: PlayerState =
          a.state === 'paused'
            ? 'paused'
            : a.state === 'loading'
              ? 'preparing'
              : 'playing';
        this.set({
          state,
          currentBlockId: a.currentBlockId,
          elapsedSeconds: a.elapsedSeconds,
          progress: session ? blockProgress(session, a.currentBlockId) : 0,
          caption: block ? captionForBlock(block) : '',
          error: null,
        });
      } else if (a.state === 'idle' && this.started && session) {
        this.started = false;
        this.set({
          state: 'completed',
          currentBlockId: null,
          progress: 1,
          caption: '',
          error: null,
        });
      }
    });
    this.unregister = registerReturnNowHooks({
      clearTemporarySessionState: () => this.emergencyReset(),
    });
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }
  private set(change: Partial<PlayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
  prepare(session: Session) {
    this.session = session;
    this.started = false;
    this.set({
      state: 'ready',
      currentBlockId: null,
      elapsedSeconds: 0,
      progress: 0,
      caption: '',
      error: null,
    });
  }
  async start() {
    if (
      !this.session ||
      !['ready', 'completed', 'error'].includes(this.snapshot.state)
    )
      return;
    if (!playerBlocks(this.session).length) {
      this.set({
        state: 'error',
        error: 'This session has no enabled blocks.',
      });
      return;
    }
    this.started = true;
    this.set({ state: 'preparing', error: null, progress: 0 });
    if (this.visual) await this.visual.playSession(this.session);
    else await this.audio.playSession(this.session);
  }
  pause() {
    if (this.snapshot.state === 'playing') {
      if (this.visual) this.visual.pause();
      else this.audio.pause();
    }
  }
  async resume() {
    if (this.snapshot.state === 'paused') {
      if (this.visual) this.visual.resume();
      else await this.audio.resume();
    }
  }
  stop() {
    if (['idle', 'ready'].includes(this.snapshot.state)) return;
    this.started = false;
    this.set({ state: 'stopping' });
    if (this.visual) this.visual.stop();
    else this.audio.stop();
    this.set({
      state: 'ready',
      currentBlockId: null,
      elapsedSeconds: 0,
      progress: 0,
      caption: '',
      error: null,
    });
  }
  retry() {
    if (this.session) this.prepare(this.session);
  }
  private emergencyReset() {
    this.started = false;
    this.session = null;
    this.set({
      state: 'idle',
      currentBlockId: null,
      elapsedSeconds: 0,
      progress: 0,
      caption: '',
      error: null,
    });
  }
  dispose() {
    this.started = false;
    this.audio.stop();
    this.unregister();
    this.unsubscribe();
    this.listeners.clear();
  }
}
