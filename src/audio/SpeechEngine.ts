import type { NarrationPart, SpeechSettings, SpeechVoice } from './types';
export type SpeechCallbacks = {
  onPartStart?: (part: NarrationPart) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};
export interface SpeechEngine {
  readonly supported: boolean;
  voices(): Promise<SpeechVoice[]>;
  speak(
    parts: NarrationPart[],
    settings: SpeechSettings,
    callbacks?: SpeechCallbacks,
  ): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}
