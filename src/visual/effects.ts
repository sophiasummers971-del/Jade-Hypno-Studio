import type { VisualSettings } from '../domain/schema';
export function effectStyle(settings: VisualSettings, reducedMotion: boolean): Record<string, string | number> {
  return {
    opacity: settings.opacity,
    filter: `blur(${settings.blur}px) brightness(${settings.brightness})`,
    transform: reducedMotion ? 'none' : `scale(${1 + settings.zoomAmount / 100}) translateX(${settings.panAmount}%)`,
  };
}
export function effectClass(settings: VisualSettings, reducedMotion: boolean) {
  if (reducedMotion) return '';
  return [settings.zoomAmount > 0 && 'visual-slow-zoom', settings.panAmount !== 0 && 'visual-slow-pan', settings.pulseAmount > 0 && 'visual-opacity-pulse', settings.brightnessPulse > 0 && 'visual-brightness-pulse', settings.fixation === 'spiral' && 'visual-spiral-active'].filter(Boolean).join(' ');
}
