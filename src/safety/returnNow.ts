export type ReturnNowHooks = {
  stopNarration?: () => void | Promise<void>;
  stopActiveMedia?: () => void | Promise<void>;
  stopVisualEffects?: () => void | Promise<void>;
  fadeOrStopAudio?: () => void | Promise<void>;
  clearTemporarySessionState?: () => void | Promise<void>;
};

export const RETURN_NOW_EVENT = 'jade:return-now';
export const RETURN_NOW_ACTION = Object.freeze({
  id: 'return-now',
  label: 'RETURN NOW',
});

let hooks: ReturnNowHooks = {};

export function registerReturnNowHooks(next: ReturnNowHooks): () => void {
  hooks = { ...next };
  return () => {
    hooks = {};
  };
}

async function call(action: (() => void | Promise<void>) | undefined) {
  if (action) await action();
}

export async function returnNow(): Promise<void> {
  window.dispatchEvent(new CustomEvent(RETURN_NOW_EVENT));
  await call(hooks.stopNarration);
  await call(hooks.stopActiveMedia);
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
    media.pause();
    media.currentTime = 0;
  });
  await call(hooks.stopVisualEffects);
  await call(hooks.fadeOrStopAudio);
  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen().catch(() => undefined);
  }
  await call(hooks.clearTemporarySessionState);
}
