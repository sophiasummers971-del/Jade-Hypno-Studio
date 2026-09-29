import { describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { newSession, defaultSettings, parseSession } from '../domain/schema';
import {
  exportSessionJson,
  importSessionJson,
  readJsonFile,
  downloadSession,
  MAX_IMPORT_BYTES,
} from './portable';
import { IndexedDBRepository } from './adapters/indexeddb';
describe('portable local session JSON', () => {
  it('exports a validated, round-trippable representation', () => {
    const session = newSession('Example', defaultSettings);
    expect(parseSession(exportSessionJson(session))).toEqual(session);
  });
  it('imports valid JSON with a new identity and preserves existing data on repeated imports', async () => {
    const repo = new IndexedDBRepository({ factory: new IDBFactory() });
    const original = await repo.save(
      newSession('Example', defaultSettings),
      null,
    );
    const imported = await importSessionJson(repo, exportSessionJson(original));
    const again = await importSessionJson(repo, exportSessionJson(original));
    expect(new Set([original.id, imported.id, again.id]).size).toBe(3);
    expect(await repo.load(original.id)).toEqual(original);
    expect(imported.description).toBe(original.description);
    await repo.close();
  });
  it.each(['{bad', '{}', '{"schemaVersion":99}', 'null'])(
    'rejects malformed import without touching persistence: %s',
    async (json) => {
      const repo = new IndexedDBRepository({ factory: new IDBFactory() });
      const save = vi.spyOn(repo, 'save');
      await expect(importSessionJson(repo, json)).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
    },
  );
  it('rejects oversized files before reading or writing', async () => {
    const file = new File([' '.repeat(MAX_IMPORT_BYTES + 1)], 'large.json');
    await expect(readJsonFile(file)).rejects.toThrow('4 MiB');
  });
  it('reads JSON through the portable file picker API', async () => {
    const json = exportSessionJson(newSession('Example', defaultSettings));
    expect(
      await readJsonFile(
        new File([json], 'session.json', { type: 'application/json' }),
      ),
    ).toBe(json);
  });
  it('hands a local JSON Blob to download without network calls', () => {
    vi.useFakeTimers();
    const create = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:test';
    });
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toMatch(/^jade-session-.*\.json$/);
        expect(this.href).toBe('blob:test');
      });
    downloadSession(newSession('Example', defaultSettings));
    expect(click).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    vi.advanceTimersByTime(60000);
    expect(revoke).toHaveBeenCalledWith('blob:test');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
