import { describe, expect, it } from 'vitest';
import {
  SessionSchema,
  SettingsSchema,
  defaultSettings,
  newSession,
  copySession,
  parseSession,
} from './schema';
describe('versioned session schema', () => {
  it('accepts a complete valid session and round-trips JSON without changing content', () => {
    const session = newSession('Example', defaultSettings);
    expect(parseSession(JSON.stringify(session))).toEqual(session);
  });
  it.each([
    { title: '' },
    { title: '   ' },
    { schemaVersion: 2 },
    { mode: 'unknown' },
    { durationEstimate: -1 },
    { blocks: [{}] },
    { createdAt: 'not-a-date' },
    { id: '../settings' },
    { unexpected: true },
  ])('rejects malformed fields %j', (patch) =>
    expect(
      SessionSchema.safeParse({
        ...newSession('Example', defaultSettings),
        ...patch,
      }).success,
    ).toBe(false),
  );
  it('malformed JSON fails with a readable error', () =>
    expect(() => parseSession('{broken')).toThrow('not valid JSON'));
  it('does not mutate a malformed object', () => {
    const input = { title: 42 };
    const before = JSON.stringify(input);
    SessionSchema.safeParse(input);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('duplicates independently with a new ID and preserves original', () => {
    const original = newSession('Example', defaultSettings);
    const copy = copySession(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Example (copy)');
    copy.audioSettings.musicLevel = 0.9;
    expect(original.audioSettings.musicLevel).toBe(0.3);
  });
  it('uses settings defaults for new sessions', () => {
    const session = newSession('Example', {
      ...defaultSettings,
      defaultSessionDuration: 12,
      captionsEnabled: false,
      defaultMusicLevel: 0.15,
    });
    expect(session.durationEstimate).toBe(720);
    expect(session.exportSettings.captionsEnabled).toBe(false);
    expect(session.audioSettings.musicLevel).toBe(0.15);
  });
  it('fills Milestone 2 defaults when loading a valid Milestone 1.1 session', () => {
    const current = newSession('Legacy', defaultSettings);
    const legacy = structuredClone(current) as Record<string, unknown>;
    delete legacy.sourceImports;
    const audio = legacy.audioSettings as Record<string, unknown>;
    for (const key of ['musicReference', 'ambientReference', 'fadeInDuration', 'fadeOutDuration']) delete audio[key];
    const visual = legacy.visualSettings as Record<string, unknown>;
    for (const key of ['mediaReference', 'backgroundType', 'opacity', 'blur', 'zoomAmount', 'pulseAmount', 'transitionType']) delete visual[key];
    const parsed = SessionSchema.parse(legacy);
    expect(parsed.sourceImports).toEqual([]);
    expect(parsed.audioSettings.musicReference).toBe('');
    expect(parsed.visualSettings.backgroundType).toBe('color');
  });
  it('fills the new words-per-minute setting for Milestone 1.1 settings', () => {
    const legacy = { ...defaultSettings } as Record<string, unknown>;
    delete legacy.wordsPerMinute;
    expect(SettingsSchema.parse(legacy).wordsPerMinute).toBe(150);
  });
  it('rejects invalid settings and unknown settings schema versions', () => {
    expect(
      SettingsSchema.safeParse({ ...defaultSettings, defaultMusicLevel: 2 })
        .success,
    ).toBe(false);
    expect(
      SettingsSchema.safeParse({ ...defaultSettings, schemaVersion: 2 })
        .success,
    ).toBe(false);
  });
});
