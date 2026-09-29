import type { AudioEngine } from '../audio/AudioEngine';
import type { Session } from '../domain/schema';
import { registerReturnNowHooks } from '../safety/returnNow';
import { captionForBlock } from './CaptionEngine';
import type { VisualSnapshot } from './types';

type Listener = (snapshot: VisualSnapshot) => void;
export class VisualEngine {
  private listeners = new Set<Listener>();
  private snapshot: VisualSnapshot = {
    state: 'idle',
    currentBlockId: null,
    elapsedSeconds: 0,
    caption: '',
    transition: 'none',
    error: null,
  };
  private session: Session | null = null;
  private video: HTMLVideoElement | null = null;
  private timers = new Set<number>();
  private unregister: () => void;
  private unsubscribe: () => void;
  constructor(readonly audio: AudioEngine) {
    this.unsubscribe = audio.subscribe((state) => {
      const block =
        this.session?.blocks.find((item) => item.id === state.currentBlockId) ??
        null;
      this.set({
        state: state.state,
        currentBlockId: state.currentBlockId,
        elapsedSeconds: state.elapsedSeconds,
        caption: block ? captionForBlock(block) : '',
        transition: block?.transitionSettings.type ?? 'none',
        error: state.error,
      });
      if (state.state === 'paused') this.video?.pause();
      if (state.state === 'playing' && this.video?.paused)
        void this.video.play().catch(() => undefined);
      if (state.state === 'idle') this.stopVisuals();
    });
    this.unregister = registerReturnNowHooks({
      stopActiveMedia: () => this.stopVisuals(),
      stopVisualEffects: () => this.stopVisuals(),
      clearTemporarySessionState: () => this.reset(),
    });
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }
  private set(change: Partial<VisualSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
  attachVideo(video: HTMLVideoElement | null) {
    this.video = video;
  }
  async playSession(session: Session) {
    this.session = session;
    await this.audio.playSession(session);
  }
  pause() {
    this.audio.pause();
    this.video?.pause();
  }
  resume() {
    void this.audio.resume();
    if (this.video) void this.video.play().catch(() => undefined);
  }
  stop() {
    this.audio.stop();
    this.stopVisuals();
    this.reset();
  }
  private stopVisuals() {
    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
    }
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
  reset() {
    this.session = null;
    this.set({
      state: 'idle',
      currentBlockId: null,
      elapsedSeconds: 0,
      caption: '',
      transition: 'none',
      error: null,
    });
  }
  dispose() {
    this.stop();
    this.unregister();
    this.unsubscribe();
    this.listeners.clear();
  }
}
