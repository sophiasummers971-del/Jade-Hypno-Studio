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

const hookSets = new Set<ReturnNowHooks>();

export function registerReturnNowHooks(next: ReturnNowHooks): () => void {
  if (Object.keys(next).length === 0) hookSets.clear();
  else hookSets.add(next);
  return () => {
    hookSets.delete(next);
  };
}

async function call(action: (() => void | Promise<void>) | undefined) {
  if (action) await action();
}

export async function returnNow(): Promise<void> {
  for (const hooks of [...hookSets]) await call(hooks.stopNarration);
  for (const hooks of [...hookSets]) await call(hooks.stopActiveMedia);
  document
    .querySelectorAll<HTMLMediaElement>('audio, video')
    .forEach((media) => {
      media.pause();
      media.currentTime = 0;
    });
  for (const hooks of [...hookSets]) await call(hooks.stopVisualEffects);
  for (const hooks of [...hookSets]) await call(hooks.fadeOrStopAudio);
  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen().catch(() => undefined);
  }
  for (const hooks of [...hookSets])
    await call(hooks.clearTemporarySessionState);
  window.dispatchEvent(new CustomEvent(RETURN_NOW_EVENT));
}
