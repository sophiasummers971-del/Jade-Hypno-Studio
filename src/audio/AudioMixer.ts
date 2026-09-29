import type { AudioLevels, LocalAudioTrack } from './types';

export class AudioMixer {
  private context: AudioContext | null = null;
  private active = new Map<
    string,
    {
      audio: HTMLAudioElement;
      gain: GainNode;
      source: MediaElementAudioSourceNode;
      settle?: (error?: Error) => void;
    }
  >();
  private levels: AudioLevels = {
    narration: 1,
    music: 0.2,
    ambient: 0.15,
    effects: 0.3,
  };

  get supported() {
    return 'AudioContext' in window || 'webkitAudioContext' in window;
  }
  async ready() {
    if (!this.supported)
      throw new Error('Web Audio is not available on this device.');
    if (!this.context) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      this.context = new Ctor();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setLevels(next: Partial<AudioLevels>) {
    this.levels = { ...this.levels, ...next };
    for (const [id, item] of this.active) {
      const kind = id.split(':', 1)[0] as keyof AudioLevels;
      item.gain.gain.value = this.levels[kind] ?? 1;
    }
  }
  async play(track: LocalAudioTrack, fadeIn = 0) {
    await this.ready();
    this.stop(track.id);
    const audio = new Audio(track.url);
    audio.preload = 'auto';
    const source = this.context!.createMediaElementSource(audio);
    const gain = this.context!.createGain();
    const level = this.levels[track.kind];
    const now = this.context!.currentTime;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, now);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, now + fadeIn);
    source.connect(gain).connect(this.context!.destination);
    this.active.set(track.id, { audio, gain, source });
    audio.addEventListener('ended', () => this.stop(track.id), { once: true });
    try {
      await audio.play();
    } catch {
      this.stop(track.id);
      throw new Error(
        'Playback was blocked or the local audio could not be decoded. Tap Play again and check the file format.',
      );
    }
  }
  async playToEnd(track: LocalAudioTrack, fadeIn = 0): Promise<void> {
    await this.ready();
    this.stop(track.id);
    const audio = new Audio(track.url);
    audio.preload = 'auto';
    const source = this.context!.createMediaElementSource(audio);
    const gain = this.context!.createGain();
    const level = this.levels[track.kind];
    const now = this.context!.currentTime;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, now);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, now + fadeIn);
    source.connect(gain).connect(this.context!.destination);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
      this.active.set(track.id, { audio, gain, source, settle });
      audio.addEventListener('ended', () => {
        settle();
        this.stop(track.id);
      }, { once: true });
      audio.addEventListener('error', () => {
        const error = new Error('The local narration audio could not be decoded.');
        settle(error);
        this.stop(track.id);
      }, { once: true });
      void audio.play().catch(() => {
        const error = new Error(
          'Playback was blocked or the local narration audio could not be decoded. Tap Play again and check the file format.',
        );
        settle(error);
        this.stop(track.id);
      });
    });
  }
  pauseAll() {
    this.active.forEach(({ audio }) => audio.pause());
  }
  async resumeAll() {
    await this.ready();
    await Promise.all(
      [...this.active.values()].map(({ audio }) =>
        audio.play().catch(() => undefined),
      ),
    );
  }
  stop(id: string) {
    const item = this.active.get(id);
    if (!item) return;
    item.audio.pause();
    item.audio.currentTime = 0;
    item.settle?.();
    item.source.disconnect();
    item.gain.disconnect();
    this.active.delete(id);
  }
  stopAll() {
    [...this.active.keys()].forEach((id) => this.stop(id));
  }
  async fadeOutAll(seconds: number) {
    if (!this.context || seconds <= 0) return this.stopAll();
    const now = this.context.currentTime;
    this.active.forEach(({ gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + seconds);
    });
    await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
    this.stopAll();
  }
}
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
