import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDBRepository } from './indexeddb';
import { defaultSettings, newSession } from '../../domain/schema';
import { duplicateSession } from '../repository';
import { Autosave } from '../autosave';
import { newExperimentRecord } from '../../experiment/model';
const setup = () => {
  const factory = new IDBFactory();
  const name = 'test-studio';
  return { factory, name, repo: new IndexedDBRepository({ factory, name }) };
};
async function raw(
  factory: IDBFactory,
  name: string,
  store: string,
  operation: (store: IDBObjectStore) => IDBRequest,
) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
describe('IndexedDB transaction adapter', () => {
  it('creates and persists session data across connection restart', async () => {
    const { repo, factory, name } = setup();
    const saved = await repo.save(newSession('Example', defaultSettings), null);
    await repo.close();
    const reopened = new IndexedDBRepository({ factory, name });
    expect(await reopened.load(saved.id)).toEqual(saved);
    await reopened.close();
  });
  it('updates and renames with a monotonic revision, retaining creation time', async () => {
    const { repo } = setup();
    const saved = await repo.save(
      newSession('Original', defaultSettings),
      null,
    );
    const next = await repo.save(
      { ...saved, title: 'Renamed', description: 'Note' },
      saved.updatedAt,
    );
    expect(next.updatedAt > saved.updatedAt).toBe(true);
    expect(next.createdAt).toBe(saved.createdAt);
    expect(await repo.load(saved.id)).toEqual(next);
    await repo.close();
  });
  it('duplicates independently with a fresh UUID', async () => {
    const { repo } = setup();
    const original = await repo.save(
      newSession('Example', defaultSettings),
      null,
    );
    const copy = await duplicateSession(repo, original);
    expect(copy.id).not.toBe(original.id);
    expect(await repo.load(original.id)).toEqual(original);
    expect((await repo.list()).sessions).toHaveLength(2);
    await repo.close();
  });
  it('moves to Trash transactionally and can restore original bytes/fields', async () => {
    const { repo, factory, name } = setup();
    const original = await repo.save(
      newSession('Example', defaultSettings),
      null,
    );
    await repo.trash(original.id, original.updatedAt);
    await expect(repo.load(original.id)).rejects.toThrow();
    const deleted = await raw(factory, name, 'trash', (store) =>
      store.get(original.id),
    );
    expect(deleted).toMatchObject({
      session: original,
      deletedAt: expect.any(String),
    });
    expect(await repo.restore(original.id)).toEqual(original);
    expect(await repo.load(original.id)).toEqual(original);
    expect(
      await raw(factory, name, 'trash', (store) => store.get(original.id)),
    ).toBeUndefined();
    await repo.close();
  });
  it('persists, edits, filters and deletes experiment observations independently of session deletion', async () => {
    const { repo, factory, name } = setup();
    const session = await repo.save(newSession('Repeated run', defaultSettings), null);
    const first = newExperimentRecord({
      sessionId: session.id,
      sessionTitle: session.title,
      sessionRevision: session.updatedAt,
      completedAt: new Date().toISOString(),
      durationSeconds: 120,
    });
    const saved = await repo.saveExperiment(first, null);
    await repo.close();
    const reopened = new IndexedDBRepository({ factory, name });
    expect(await reopened.listExperiments(session.id)).toEqual([saved]);
    const edited = await reopened.saveExperiment(
      { ...saved, notes: 'A local note', ratings: { ...saved.ratings, comfort: 4 } },
      saved.updatedAt,
    );
    await reopened.trash(session.id, session.updatedAt);
    expect((await reopened.listExperiments())[0]).toMatchObject({
      id: edited.id,
      sessionId: session.id,
      sessionTitle: 'Repeated run',
      notes: 'A local note',
    });
    await reopened.deleteExperiment(edited.id, edited.updatedAt);
    expect(await reopened.listExperiments()).toEqual([]);
    await reopened.close();
  });
  it('persists settings across connection restart', async () => {
    const { repo, factory, name } = setup();
    const settings = {
      ...defaultSettings,
      defaultVoiceId: 'placeholder',
      defaultMusicLevel: 0.1,
    };
    await repo.saveSettings(settings);
    await repo.close();
    const reopened = new IndexedDBRepository({ factory, name });
    expect(await reopened.loadSettings()).toEqual(settings);
    await reopened.close();
  });
  it('lists corrupt records separately without modifying them or hiding good records', async () => {
    const { repo, factory, name } = setup();
    const good = await repo.save(newSession('Good', defaultSettings), null);
    const bad = newSession('Bad', defaultSettings);
    const corrupt = { ...bad, schemaVersion: 99 };
    await raw(factory, name, 'sessions', (store) => store.put(corrupt, bad.id));
    const list = await repo.list();
    expect(list.sessions).toEqual([good]);
    expect(list.issues).toHaveLength(1);
    await expect(repo.load(bad.id)).rejects.toThrow('Invalid stored session');
    await expect(repo.save(bad, bad.updatedAt)).rejects.toThrow();
    expect(
      await raw(factory, name, 'sessions', (store) => store.get(bad.id)),
    ).toEqual(corrupt);
    await repo.close();
  });
  it('preserves corrupt settings rather than replacing with defaults', async () => {
    const { repo, factory, name } = setup();
    await repo.loadSettings();
    await raw(factory, name, 'settings', (store) =>
      store.put({ invalid: true }, 'preferences'),
    );
    await expect(repo.loadSettings()).rejects.toThrow();
    await expect(repo.saveSettings(defaultSettings)).rejects.toThrow();
    expect(
      await raw(factory, name, 'settings', (store) => store.get('preferences')),
    ).toEqual({ invalid: true });
    await repo.close();
  });
  it('rejects mismatched stored IDs', async () => {
    const { repo, factory, name } = setup();
    const original = await repo.save(
      newSession('Original', defaultSettings),
      null,
    );
    const other = newSession('Other', defaultSettings);
    await raw(factory, name, 'sessions', (store) =>
      store.put(other, original.id),
    );
    await expect(repo.load(original.id)).rejects.toThrow('storage key');
    await repo.close();
  });
  it('atomically rejects a stale write across two adapter connections', async () => {
    const { repo, factory, name } = setup();
    const second = new IndexedDBRepository({ factory, name });
    const initial = await repo.save(
      newSession('Initial', defaultSettings),
      null,
    );
    const outcomes = await Promise.allSettled([
      repo.save({ ...initial, title: 'First' }, initial.updatedAt),
      second.save({ ...initial, title: 'Second' }, initial.updatedAt),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await repo.close();
    await second.close();
  });
  it('rejects an existing active or trashed ID on create', async () => {
    const { repo } = setup();
    const saved = await repo.save(newSession('Example', defaultSettings), null);
    await expect(repo.save(saved, null)).rejects.toThrow('already exists');
    await repo.trash(saved.id, saved.updatedAt);
    await expect(repo.save(saved, null)).rejects.toThrow('Trash');
    await repo.close();
  });
  it('rejects stale deletion without moving anything', async () => {
    const { repo } = setup();
    const saved = await repo.save(newSession('Example', defaultSettings), null);
    await expect(repo.trash(saved.id, 'stale')).rejects.toThrow();
    expect(await repo.load(saved.id)).toEqual(saved);
    await repo.close();
  });
  it('rolls back deletion if its trash write fails', async () => {
    const { repo, factory, name } = setup();
    const saved = await repo.save(newSession('Example', defaultSettings), null);
    await raw(factory, name, 'trash', (store) =>
      store.add({ session: saved, deletedAt: saved.updatedAt }, saved.id),
    );
    await expect(repo.trash(saved.id, saved.updatedAt)).rejects.toThrow();
    expect(await repo.load(saved.id)).toEqual(saved);
    await repo.close();
  });
  it('does not report success when the transaction aborts after request success', async () => {
    const { repo } = setup();
    const saved = await repo.save(newSession('Example', defaultSettings), null);
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        const request = original.apply(this, args);
        request.addEventListener('success', () => this.transaction.abort());
        return request;
      });
    await expect(
      repo.save({ ...saved, title: 'Not committed' }, saved.updatedAt),
    ).rejects.toThrow('aborted');
    spy.mockRestore();
    expect(await repo.load(saved.id)).toEqual(saved);
    await repo.close();
  });
  it('ordered autosave uses IndexedDB without stale revisions', async () => {
    const { repo } = setup();
    const saved = await repo.save(newSession('Initial', defaultSettings), null);
    const writer = new Autosave(repo, saved, vi.fn());
    writer.edit({ ...saved, title: 'First' });
    const pending = writer.flush();
    writer.edit({ ...saved, title: 'Last' });
    await pending;
    expect((await repo.load(saved.id)).title).toBe('Last');
    expect(writer.dirty).toBe(false);
    writer.dispose();
    await repo.close();
  });
});
