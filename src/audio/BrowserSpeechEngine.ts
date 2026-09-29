import type { SpeechCallbacks, SpeechEngine } from './SpeechEngine';
import type { NarrationPart, SpeechSettings, SpeechVoice } from './types';

export class BrowserSpeechEngine implements SpeechEngine {
  private synth: SpeechSynthesis | null;
  private timer: number | null = null;
  private cancelled = false;
  private resumePause: (() => void) | null = null;

  constructor(private readonly host: Window = window) {
    this.synth = 'speechSynthesis' in host ? host.speechSynthesis : null;
  }
  get supported() {
    return Boolean(this.synth && 'SpeechSynthesisUtterance' in this.host);
  }

  async voices(): Promise<SpeechVoice[]> {
    if (!this.synth) return [];
    let voices = this.synth.getVoices();
    if (!voices.length) {
      await new Promise<void>((resolve) => {
        const done = () => {
          this.synth?.removeEventListener('voiceschanged', done);
          resolve();
        };
        this.synth?.addEventListener('voiceschanged', done, { once: true });
        this.host.setTimeout(done, 400);
      });
      voices = this.synth.getVoices();
    }
    return voices.map((voice) => ({
      id: voice.voiceURI || voice.name,
      name: voice.name,
      lang: voice.lang,
      default: voice.default,
    }));
  }

  async speak(
    parts: NarrationPart[],
    settings: SpeechSettings,
    callbacks: SpeechCallbacks = {},
  ): Promise<void> {
    if (!this.supported || !this.synth)
      throw new Error('Speech synthesis is not available on this device.');
    this.stop();
    this.cancelled = false;
    for (const part of parts) {
      if (this.cancelled) return;
      callbacks.onPartStart?.(part);
      if (part.type === 'pause') await this.wait(part.seconds * 1000);
      else await this.utter(part.text, settings);
    }
    if (!this.cancelled) callbacks.onEnd?.();
  }

  private async utter(text: string, settings: SpeechSettings) {
    const synth = this.synth!;
    const available = synth.getVoices();
    const selected = available.find(
      (v) => (v.voiceURI || v.name) === settings.voiceId,
    );
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (selected) utterance.voice = selected;
      utterance.rate = Math.min(2, Math.max(0.5, settings.rate));
      utterance.pitch = Math.min(2, Math.max(0, 1 + settings.pitch / 12));
      utterance.volume = Math.min(1, Math.max(0, settings.volume));
      utterance.onend = () => resolve();
      utterance.onerror = (event) =>
        event.error === 'canceled' || event.error === 'interrupted'
          ? resolve()
          : reject(new Error('Speech playback was interrupted.'));
      synth.speak(utterance);
    });
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const finish = () => {
        this.timer = null;
        this.resumePause = null;
        resolve();
      };
      this.resumePause = finish;
      this.timer = this.host.setTimeout(finish, ms);
    });
  }
  pause() {
    this.synth?.pause();
    if (this.timer !== null) {
      this.host.clearTimeout(this.timer);
      this.timer = null;
    }
  }
  resume() {
    this.synth?.resume();
    if (this.resumePause && this.timer === null)
      this.timer = this.host.setTimeout(this.resumePause, 0);
  }
  stop() {
    this.cancelled = true;
    if (this.timer !== null) this.host.clearTimeout(this.timer);
    this.timer = null;
    this.resumePause = null;
    this.synth?.cancel();
  }
}
