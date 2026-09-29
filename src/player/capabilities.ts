import type { PlayerCapabilities } from './types';

type CapabilityHost = {
  document: Pick<Document, 'fullscreenEnabled'> & {
    documentElement: Pick<HTMLElement, 'requestFullscreen'>;
  };
  matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  URL?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
};

function defaultCapabilityHost(): CapabilityHost {
  return {
    document,
    matchMedia:
      typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia.bind(globalThis)
        : undefined,
    speechSynthesis: globalThis.speechSynthesis,
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
    AudioContext: globalThis.AudioContext,
    webkitAudioContext:
      'webkitAudioContext' in globalThis
        ? (
            globalThis as typeof globalThis & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext
        : undefined,
    URL: globalThis.URL,
  };
}

export function playerCapabilities(
  host: CapabilityHost = defaultCapabilityHost(),
): PlayerCapabilities {
  const reducedMotion =
    typeof host.matchMedia === 'function'
      ? host.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return {
    fullscreen: Boolean(
      host.document.fullscreenEnabled &&
      host.document.documentElement.requestFullscreen,
    ),
    speech:
      typeof host.speechSynthesis !== 'undefined' &&
      typeof host.SpeechSynthesisUtterance === 'function',
    audioContext:
      typeof host.AudioContext === 'function' ||
      typeof host.webkitAudioContext === 'function',
    objectUrls:
      typeof host.URL?.createObjectURL === 'function' &&
      typeof host.URL?.revokeObjectURL === 'function',
    reducedMotion,
  };
}
