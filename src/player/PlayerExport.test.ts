import { describe, expect, it } from 'vitest';
import { createSessionFromTemplate } from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';
import { renderCapability, sessionPackage } from './PlayerExport';
describe('PlayerExport', () => {
  it('truthfully falls back when MediaRecorder is absent', () => {
    const host = {};
    expect(renderCapability(host).supported).toBe(false);
  });
  it('exports a documented versioned local session package', () => {
    const session = createSessionFromTemplate(
      'Portable',
      'blank',
      defaultSettings,
    );
    const parsed = JSON.parse(sessionPackage(session)) as {
      packageVersion: number;
      kind: string;
      session: { title: string };
    };
    expect(parsed).toMatchObject({
      packageVersion: 1,
      kind: 'jade-hypno-studio-session',
    });
    expect(parsed.session.title).toBe('Portable');
  });
});
