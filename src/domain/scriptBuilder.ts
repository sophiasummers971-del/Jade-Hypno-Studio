import {
  SessionSchema,
  SessionBlockSchema,
  blockTypes,
  newSession,
  type Session,
  type SessionBlock,
  type Settings,
} from './schema';
import { randomId } from './uuid';

export type TemplateId = 'blank' | 'relaxation' | 'immersive-fantasy' | 'adult-immersive';
export type ImportedTextDraft = { fileName: string; originalText: string; workingText: string; confirmed: boolean };
export type ImportedPart = { title: string; type: SessionBlock['type']; narration: string };

const defaultStructure: Array<[SessionBlock['type'], string]> = [
  ['preflight', 'Preflight'],
  ['arrival', 'Arrival'],
  ['attention', 'Attention'],
  ['settling', 'Settling'],
  ['deepening', 'Deepening'],
  ['main', 'Main Fantasy'],
  ['intensification', 'Intensification'],
  ['release', 'Release'],
  ['return', 'Return'],
  ['exit', 'Clean Exit'],
];

export const sessionTemplates: Readonly<Record<TemplateId, ReadonlyArray<readonly [SessionBlock['type'], string]>>> = {
  blank: [],
  relaxation: [
    ['preflight', 'Preflight'], ['arrival', 'Arrival'], ['settling', 'Settling'], ['deepening', 'Deepening'], ['main', 'Relaxation'], ['return', 'Return'], ['exit', 'Clean Exit'],
  ],
  'immersive-fantasy': defaultStructure,
  'adult-immersive': defaultStructure,
};

export function createBlock(type: SessionBlock['type'] = 'custom', title = 'New Block'): SessionBlock {
  return SessionBlockSchema.parse({
    id: randomId(),
    type,
    title,
    enabled: true,
    narration: '',
    estimatedDuration: 0,
    manualDurationOverride: null,
    voiceSettings: { voiceId: '', rate: 1, pitch: 0, volume: 1 },
    visualSettings: { resolution: '1920x1080', backgroundColor: '#101319' },
    audioSettings: { narrationLevel: 0.8, musicLevel: 0.3, ambientLevel: 0.2 },
    captionSettings: { enabled: true },
    transitionSettings: { type: 'none', duration: 0 },
    notes: '',
  });
}

export function createSessionFromTemplate(title: string, template: TemplateId, settings: Settings): Session {
  const base = newSession(title, settings);
  const blocks = sessionTemplates[template].map(([type, label]) => {
    const block = createBlock(type, label);
    block.voiceSettings.voiceId = settings.defaultVoiceId;
    block.audioSettings.narrationLevel = settings.defaultNarrationLevel;
    block.audioSettings.musicLevel = settings.defaultMusicLevel;
    block.audioSettings.ambientLevel = settings.defaultAmbientLevel;
    block.captionSettings.enabled = settings.captionsEnabled;
    block.visualSettings.resolution = settings.defaultOutputResolution;
    return block;
  });
  return SessionSchema.parse({ ...base, blocks, durationEstimate: 0 });
}

function withBlocks(session: Session, blocks: SessionBlock[]): Session {
  return SessionSchema.parse({ ...session, blocks });
}
export function addBlock(session: Session, block = createBlock()): Session {
  return withBlocks(session, [...session.blocks, block]);
}
export function updateBlock(session: Session, id: string, patch: Partial<SessionBlock>): Session {
  return withBlocks(session, session.blocks.map((block) => block.id === id ? { ...block, ...patch, id: block.id } : block));
}
export function duplicateBlock(session: Session, id: string): Session {
  const index = session.blocks.findIndex((block) => block.id === id);
  if (index < 0) return session;
  const copy = structuredClone(session.blocks[index]);
  copy.id = randomId();
  copy.title = `${copy.title.slice(0, 193)} (copy)`;
  const blocks = [...session.blocks];
  blocks.splice(index + 1, 0, copy);
  return withBlocks(session, blocks);
}
export function deleteBlock(session: Session, id: string): Session {
  return withBlocks(session, session.blocks.filter((block) => block.id !== id));
}
export function moveBlock(session: Session, id: string, delta: -1 | 1): Session {
  const index = session.blocks.findIndex((block) => block.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= session.blocks.length) return session;
  const blocks = [...session.blocks];
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return withBlocks(session, blocks);
}
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}
export function estimateNarrationSeconds(text: string, wordsPerMinute: number): number {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) return 0;
  return Math.round((countWords(text) / wordsPerMinute) * 60);
}
export function effectiveDuration(block: SessionBlock, wordsPerMinute: number): number {
  return block.manualDurationOverride ?? estimateNarrationSeconds(block.narration, wordsPerMinute);
}
export type TimelineItem = { id: string; order: number; title: string; enabled: boolean; start: number; end: number; duration: number };
export function timelineForSession(session: Session, wordsPerMinute: number): TimelineItem[] {
  let cursor = 0;
  return session.blocks.map((block, index) => {
    const duration = effectiveDuration(block, wordsPerMinute);
    const start = cursor;
    const end = block.enabled ? start + duration : start;
    if (block.enabled) cursor = end;
    return { id: block.id, order: index + 1, title: block.title || block.type, enabled: block.enabled, start, end, duration };
  });
}
export function importTextToDraft(originalText: string, fileName = 'pasted text'): ImportedTextDraft {
  return { originalText, workingText: originalText, fileName, confirmed: false };
}
const headingTypes: Record<string, SessionBlock['type']> = {
  preflight: 'preflight', arrival: 'arrival', attention: 'attention', settling: 'settling', deepening: 'deepening', main: 'main', 'main fantasy': 'main', intensification: 'intensification', release: 'release', return: 'return', exit: 'exit', 'clean exit': 'exit',
};
function normalizedHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/u, '').replace(/^\*\*(.+)\*\*$/u, '$1').trim();
}
export function splitImportedText(text: string): ImportedPart[] {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  const parts: ImportedPart[] = [];
  let current: ImportedPart | null = null;
  const flush = () => {
    if (current && (current.narration.trim() || current.title)) {
      current.narration = current.narration.trim();
      parts.push(current);
    }
  };
  for (const line of lines) {
    const heading = normalizedHeading(line);
    const key = heading.toLowerCase();
    const isMarkdownHeading = /^#{1,6}\s+/u.test(line);
    if ((isMarkdownHeading || key in headingTypes) && heading.length <= 120) {
      flush();
      current = { title: heading || 'Imported Block', type: headingTypes[key] ?? 'custom', narration: '' };
    } else {
      if (!current) current = { title: 'Imported Script', type: 'custom', narration: '' };
      current.narration += `${line}\n`;
    }
  }
  flush();
  return parts.length ? parts : [{ title: 'Imported Script', type: 'custom', narration: text.trim() }];
}
export function appendImportedParts(session: Session, parts: ImportedPart[], source?: ImportedTextDraft): Session {
  const blocks = parts.map((part) => ({ ...createBlock(part.type, part.title), narration: part.narration }));
  const next = withBlocks(session, [...session.blocks, ...blocks]);
  if (!source) return next;
  return SessionSchema.parse({
    ...next,
    sourceImports: [
      ...next.sourceImports,
      { id: randomId(), fileName: source.fileName, originalText: source.originalText, importedAt: new Date().toISOString() },
    ],
  });
}
export function isBlockType(value: string): value is SessionBlock['type'] {
  return (blockTypes as readonly string[]).includes(value);
}
