import { describe, expect, it } from 'vitest';
import { defaultSettings, SessionSchema } from './schema';
import {
  addBlock,
  appendImportedParts,
  createBlock,
  createSessionFromTemplate,
  deleteBlock,
  duplicateBlock,
  estimateNarrationSeconds,
  importTextToDraft,
  moveBlock,
  sessionTemplates,
  splitImportedText,
  timelineForSession,
  updateBlock,
} from './scriptBuilder';

describe('Milestone 2 script builder domain', () => {
  it('creates the default structured session template', () => {
    const session = createSessionFromTemplate('Example', 'immersive-fantasy', defaultSettings);
    expect(session.blocks.map((block) => block.title)).toEqual([
      'Preflight','Arrival','Attention','Settling','Deepening','Main Fantasy','Intensification','Release','Return','Clean Exit',
    ]);
    expect(new Set(session.blocks.map((block) => block.id)).size).toBe(10);
  });

  it('creates a truly blank template', () => {
    expect(createSessionFromTemplate('Blank', 'blank', defaultSettings).blocks).toEqual([]);
  });

  it('adds, duplicates, reorders and deletes blocks with independent IDs', () => {
    let session = createSessionFromTemplate('Blank', 'blank', defaultSettings);
    const block = createBlock('arrival', 'Arrival');
    session = addBlock(session, block);
    session = duplicateBlock(session, block.id);
    expect(session.blocks).toHaveLength(2);
    expect(session.blocks[1].id).not.toBe(block.id);
    session = moveBlock(session, session.blocks[1].id, -1);
    expect(session.blocks[0].id).not.toBe(block.id);
    session = deleteBlock(session, block.id);
    expect(session.blocks).toHaveLength(1);
  });

  it('calculates narration duration and respects manual override', () => {
    const words = Array.from({ length: 150 }, () => 'word').join(' ');
    expect(estimateNarrationSeconds(words, 150)).toBe(60);
    let session = createSessionFromTemplate('Blank', 'blank', defaultSettings);
    const block = { ...createBlock('custom', 'Custom'), narration: words };
    session = addBlock(session, block);
    let timeline = timelineForSession(session, 150);
    expect(timeline[0].duration).toBe(60);
    session = updateBlock(session, block.id, { manualDurationOverride: 42 });
    timeline = timelineForSession(session, 150);
    expect(timeline[0].duration).toBe(42);
  });

  it('disabled blocks remain visible but do not contribute to active runtime', () => {
    let session = createSessionFromTemplate('Blank', 'blank', defaultSettings);
    session = addBlock(session, { ...createBlock('arrival', 'One'), manualDurationOverride: 30 });
    session = addBlock(session, { ...createBlock('attention', 'Two'), manualDurationOverride: 45, enabled: false });
    const timeline = timelineForSession(session, 150);
    expect(timeline.map((item) => [item.start, item.end])).toEqual([[0, 30], [30, 30]]);
  });

  it('serializes voice, caption, visual, audio and transition configuration', () => {
    let session = createSessionFromTemplate('Config', 'blank', defaultSettings);
    const block = createBlock('custom', 'Configured');
    block.voiceSettings = { ...block.voiceSettings, voiceId: 'local-voice', rate: 1.2, pitch: -1, volume: 0.7 };
    block.captionSettings = { ...block.captionSettings, mode: 'emphasis-only', fontSize: 36, alignment: 'right', position: 'top', opacity: 0.8 };
    block.visualSettings = { ...block.visualSettings, mediaReference: 'local://image', backgroundType: 'image', opacity: 0.9, blur: 2, zoomAmount: 0.4, pulseAmount: 0.2, transitionType: 'fade' };
    block.audioSettings = { ...block.audioSettings, musicReference: 'local://music', ambientReference: 'local://ambient', musicLevel: 0.4, ambientLevel: 0.25, fadeInDuration: 2, fadeOutDuration: 3 };
    block.transitionSettings = { type: 'crossfade', duration: 1.5 };
    session = addBlock(session, block);
    const parsed = SessionSchema.parse(JSON.parse(JSON.stringify(session)));
    expect(parsed.blocks[0].voiceSettings.voiceId).toBe('local-voice');
    expect(parsed.blocks[0].captionSettings.mode).toBe('emphasis-only');
    expect(parsed.blocks[0].visualSettings.mediaReference).toBe('local://image');
    expect(parsed.blocks[0].audioSettings.musicReference).toBe('local://music');
    expect(parsed.blocks[0].transitionSettings.type).toBe('crossfade');
  });

  it('keeps private notes separate from narration through serialization', () => {
    let session = createSessionFromTemplate('Blank', 'blank', defaultSettings);
    session = addBlock(session, { ...createBlock('custom', 'Separate'), narration: 'Speak this.', notes: 'Never render this.' });
    const serialized = JSON.stringify(session);
    const parsed = SessionSchema.parse(JSON.parse(serialized));
    expect(parsed.blocks[0].narration).toBe('Speak this.');
    expect(parsed.blocks[0].notes).toBe('Never render this.');
    expect(parsed.blocks[0].narration).not.toContain(parsed.blocks[0].notes);
  });

  it('keeps imported TXT/Markdown reviewable before conversion', () => {
    const draft = importTextToDraft('# Arrival\nBreathe slowly.\n\n## Return\nOpen your eyes.', 'sample.md');
    expect(draft.originalText).toContain('# Arrival');
    expect(draft.confirmed).toBe(false);
    const editedDraft = { ...draft, workingText: '# Arrival\nEdited locally.' };
    expect(editedDraft.originalText).toBe(draft.originalText);
    const parts = splitImportedText(editedDraft.workingText);
    expect(parts.map((part) => part.title)).toEqual(['Arrival']);
    expect(parts[0].narration).toContain('Edited locally.');
    const session = appendImportedParts(createSessionFromTemplate('Import', 'blank', defaultSettings), parts, { ...editedDraft, confirmed: true });
    expect(session.sourceImports[0].originalText).toBe(draft.originalText);
  });

  it('template instances never mutate the template definition', () => {
    const before = JSON.stringify(sessionTemplates);
    const session = createSessionFromTemplate('Template', 'relaxation', defaultSettings);
    session.blocks[0].title = 'Changed locally';
    expect(JSON.stringify(sessionTemplates)).toBe(before);
  });

  it('rejects invalid values and accepts valid editor state', () => {
    const session = createSessionFromTemplate('Valid', 'immersive-fantasy', defaultSettings);
    expect(SessionSchema.safeParse(session).success).toBe(true);
    expect(SessionSchema.safeParse({ ...session, blocks: [{ ...session.blocks[0], captionSettings: { ...session.blocks[0].captionSettings, opacity: 2 } }] }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, blocks: [{ ...session.blocks[0], transitionSettings: { type: 'wipe', duration: 1 } }] }).success).toBe(false);
  });
});
