import type { Session, SessionBlock } from '../domain/schema';
import { registerReturnNowHooks } from '../safety/returnNow';
import { AudioMixer } from './AudioMixer';
import { parseNarration, playableBlocks } from './AudioTimeline';
import type { SpeechEngine } from './SpeechEngine';
import type { AudioEngineSnapshot, LocalAudioTrack } from './types';
import type { MediaResolver } from '../visual/MediaResolver';

type Listener = (snapshot: AudioEngineSnapshot) => void;
export class AudioEngine {
  private snapshot: AudioEngineSnapshot = {
    state: 'idle',
    currentBlockId: null,
    elapsedSeconds: 0,
    error: null,
  };
  private listeners = new Set<Listener>();
  private token = 0;
  private startedAt = 0;
  private tracks: LocalAudioTrack[] = [];
  private unregisterReturnNow: (() => void) | null = null;

  constructor(
    readonly speech: SpeechEngine,
    readonly mixer: AudioMixer,
    readonly media?: MediaResolver,
  ) {
    this.unregisterReturnNow = registerReturnNowHooks({
      stopNarration: () => {
        this.speech.stop();
        this.mixer.stopAll();
      },
      stopActiveMedia: () => this.mixer.stopAll(),
      fadeOrStopAudio: () => this.mixer.stopAll(),
      clearTemporarySessionState: () => this.reset(),
    });
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private set(change: Partial<AudioEngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((l) => l(this.snapshot));
  }
  addTrack(track: LocalAudioTrack) {
    this.tracks = [...this.tracks.filter((x) => x.kind !== track.kind), track];
  }
  removeTrack(kind: LocalAudioTrack['kind']) {
    this.tracks
      .filter((x) => x.kind === kind)
      .forEach((x) => URL.revokeObjectURL(x.url));
    this.tracks = this.tracks.filter((x) => x.kind !== kind);
  }
  async playBlock(block: SessionBlock) {
    if (this.snapshot.state === 'playing' || this.snapshot.state === 'loading')
      return;
    const token = ++this.token;
    this.startedAt = performance.now();
    this.set({ state: 'loading', currentBlockId: block.id, error: null });
    try {
      this.mixer.setLevels({ narration: block.audioSettings.narrationLevel });
      this.set({ state: 'playing' });
      await this.playNarration(block);
      if (token === this.token)
        this.set({
          state: 'idle',
          currentBlockId: null,
          elapsedSeconds: (performance.now() - this.startedAt) / 1000,
        });
    } catch (error) {
      if (token === this.token)
        this.set({
          state: 'error',
          error:
            error instanceof Error ? error.message : 'Audio playback failed.',
        });
    }
  }
  async playSession(session: Session) {
    if (this.snapshot.state === 'playing' || this.snapshot.state === 'loading')
      return;
    const token = ++this.token;
    this.startedAt = performance.now();
    this.set({ state: 'loading', error: null });
    try {
      this.mixer.setLevels({
        narration: session.audioSettings.narrationLevel,
        music: session.audioSettings.musicLevel,
        ambient: session.audioSettings.ambientLevel,
        effects: session.audioSettings.effectsLevel,
      });
      await this.mixer.ready();
      for (const track of this.tracks.filter(
        (x) => x.kind === 'music' || x.kind === 'ambient',
      ))
        await this.mixer.play(track, session.audioSettings.fadeInDuration);
      this.set({ state: 'playing' });
      for (const block of playableBlocks(session)) {
        if (token !== this.token) return;
        this.set({
          currentBlockId: block.id,
          elapsedSeconds: (performance.now() - this.startedAt) / 1000,
        });
        await this.playNarration(block);
      }
      if (token === this.token) {
        await this.mixer.fadeOutAll(session.audioSettings.fadeOutDuration);
        this.set({
          state: 'idle',
          currentBlockId: null,
          elapsedSeconds: (performance.now() - this.startedAt) / 1000,
        });
      }
    } catch (error) {
      this.mixer.stopAll();
      if (token === this.token)
        this.set({
          state: 'error',
          error:
            error instanceof Error ? error.message : 'Audio playback failed.',
        });
    }
  }
  private async playNarration(block: SessionBlock) {
    const reference = block.audioSettings.narrationReference;
    if (!reference) {
      await this.speech.speak(parseNarration(block.narration), {
        ...block.voiceSettings,
        volume: block.voiceSettings.volume * block.audioSettings.narrationLevel,
      });
      return;
    }
    if (!this.media)
      throw new Error('Local narration media is unavailable in this player.');
    const resolved = await this.media.resolveAudio(reference);
    if (!resolved)
      throw new Error(
        'The local narration audio file is missing from this device.',
      );
    try {
      await this.mixer.playToEnd({
        id: `narration:${block.id}`,
        kind: 'narration',
        name: resolved.asset.name,
        mimeType: resolved.asset.mimeType,
        url: resolved.url,
      });
    } finally {
      this.media.revoke(reference);
    }
  }
  pause() {
    if (this.snapshot.state !== 'playing') return;
    this.speech.pause();
    this.mixer.pauseAll();
    this.set({ state: 'paused' });
  }
  async resume() {
    if (this.snapshot.state !== 'paused') return;
    this.speech.resume();
    await this.mixer.resumeAll();
    this.set({ state: 'playing' });
  }
  stop() {
    ++this.token;
    this.set({ state: 'stopping' });
    this.speech.stop();
    this.mixer.stopAll();
    this.reset();
  }
  restartBlock(block: SessionBlock) {
    this.stop();
    return this.playBlock(block);
  }
  reset() {
    this.set({
      state: 'idle',
      currentBlockId: null,
      elapsedSeconds: 0,
      error: null,
    });
  }
  dispose() {
    this.stop();
    this.unregisterReturnNow?.();
    this.unregisterReturnNow = null;
    this.tracks.forEach((x) => URL.revokeObjectURL(x.url));
    this.tracks = [];
    this.listeners.clear();
  }
}
