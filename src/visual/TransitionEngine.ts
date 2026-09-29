import type { TransitionSettings } from '../domain/schema';
export function transitionStyle(
  settings: TransitionSettings,
  reducedMotion: boolean,
) {
  if (reducedMotion || settings.type === 'none') return { transition: 'none' };
  const duration = Math.max(0, settings.duration);
  return { transition: `opacity ${duration}s ease` };
}
