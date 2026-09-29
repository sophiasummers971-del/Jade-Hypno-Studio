import type { PlaybackState } from '../audio/types';

export type VisualMediaKind = 'image' | 'video' | 'gif';
export type VisualAsset = {
  id: string;
  name: string;
  mimeType: string;
  kind: VisualMediaKind;
  size: number;
  blob: Blob;
};
export type ResolvedMedia = { asset: Omit<VisualAsset, 'blob'>; url: string };
export type AudioAsset = {
  id: string;
  name: string;
  mimeType: string;
  kind: 'audio';
  size: number;
  blob: Blob;
};
export type ResolvedAudio = { asset: Omit<AudioAsset, 'blob'>; url: string };
export type VisualSnapshot = {
  state: PlaybackState;
  currentBlockId: string | null;
  elapsedSeconds: number;
  caption: string;
  transition: 'none' | 'fade' | 'crossfade';
  error: string | null;
};
