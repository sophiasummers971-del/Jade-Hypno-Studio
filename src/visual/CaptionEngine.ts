import type { SessionBlock } from '../domain/schema';

export function captionForBlock(block: SessionBlock): string {
  const settings = block.captionSettings;
  if (!settings.enabled || settings.mode === 'none') return '';
  const narration = block.narration.replace(/\[pause\s*:[^\]]+\]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (settings.mode === 'full-narration') return narration;
  if (settings.mode === 'selected-phrases') return settings.selectedPhrases.join(' · ');
  const emphasized = [...block.narration.matchAll(/\*\*([^*]+)\*\*|__([^_]+)__/g)].map((match) => (match[1] ?? match[2]).trim());
  return emphasized.join(' · ');
}
