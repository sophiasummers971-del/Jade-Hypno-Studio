export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopping' | 'error';
export type SpeechVoice = { id: string; name: string; lang: string; default: boolean };
export type SpeechSettings = { voiceId: string; rate: number; pitch: number; volume: number };
export type NarrationPart = { type: 'speech'; text: string } | { type: 'pause'; seconds: number };
export type AudioTrackKind = 'music' | 'ambient' | 'effects';
export type LocalAudioTrack = { id: string; kind: AudioTrackKind; name: string; url: string; mimeType: string };
export type AudioLevels = { narration: number; music: number; ambient: number; effects: number };
export type AudioEngineSnapshot = { state: PlaybackState; currentBlockId: string | null; elapsedSeconds: number; error: string | null };
