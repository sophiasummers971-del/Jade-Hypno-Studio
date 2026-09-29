import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSession, defaultSettings, type Session } from '../domain/schema';
import { Autosave } from './autosave';
import { memoryRepository } from '../test/memoryRepository';
import { duplicateSession } from './repository';
afterEach(() => vi.useRealTimers());
async function setup() {
  const repo = memoryRepository();
  const saved = await repo.save(newSession('Example', defaultSettings), null);
  const notify = vi.fn();
  const writer = new Autosave(repo, saved, notify);
  return { repo, saved, notify, writer };
}
describe('autosave integrity', () => {
  it('debounces rapid edits to one write of the latest contents', async () => {
    vi.useFakeTimers();
    const { repo, saved, writer } = await setup();
    const save = vi.spyOn(repo, 'save');
    writer.edit({ ...saved, title: 'First' });
    writer.edit({ ...saved, title: 'Latest' });
    await vi.advanceTimersByTimeAsync(599);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect((await repo.load(saved.id)).title).toBe('Latest');
    expect(writer.dirty).toBe(false);
    writer.dispose();
  });
  it('does not allow an older in-flight write to acknowledge later edits', async () => {
    const { repo, saved, writer, notify } = await setup();
    const real = repo.save.bind(repo);
    let release!: (session: Session) => void;
    vi.spyOn(repo, 'save').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    writer.edit({ ...saved, title: 'First' });
    const flushing = writer.flush();
    writer.edit({ ...saved, title: 'Second' });
    const first = await real({ ...saved, title: 'First' }, saved.updatedAt);
    release(first);
    await flushing;
    expect((await repo.load(saved.id)).title).toBe('Second');
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(
      notify.mock.calls.filter((call) => call[0] === 'saved'),
    ).toHaveLength(1);
    writer.dispose();
  });
  it('surfaces disk failure, retains dirty edits, and allows retry', async () => {
    const { repo, saved, writer, notify } = await setup();
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('Disk full'));
    writer.edit({ ...saved, title: 'Keep me' });
    await expect(writer.flush()).rejects.toThrow('Disk full');
    expect(writer.dirty).toBe(true);
    expect(writer.snapshot.title).toBe('Keep me');
    expect(notify).toHaveBeenLastCalledWith(
      'error',
      undefined,
      expect.any(Error),
    );
    await writer.flush();
    expect(writer.dirty).toBe(false);
    expect((await repo.load(saved.id)).title).toBe('Keep me');
    writer.dispose();
  });
  it('flush saves before debounce expires and clean flush does not write', async () => {
    const { repo, saved, writer } = await setup();
    const save = vi.spyOn(repo, 'save');
    writer.edit({ ...saved, description: 'Note' });
    await writer.flush();
    await writer.flush();
    expect(save).toHaveBeenCalledTimes(1);
    writer.dispose();
  });
  it('concurrent flush callers share the same ordered writer', async () => {
    const { repo, saved, writer } = await setup();
    const save = vi.spyOn(repo, 'save');
    writer.edit({ ...saved, title: 'One write' });
    await Promise.all([writer.flush(), writer.flush()]);
    expect(save).toHaveBeenCalledTimes(1);
    writer.dispose();
  });
  it('conflicting updates do not overwrite the saved session', async () => {
    const { repo, saved, writer } = await setup();
    await repo.save({ ...saved, title: 'External' }, saved.updatedAt);
    writer.edit({ ...saved, title: 'Local' });
    await expect(writer.flush()).rejects.toThrow('Conflict');
    expect((await repo.load(saved.id)).title).toBe('External');
    writer.dispose();
  });
  it('Save as copy can preserve edits independently of the original writer', async () => {
    const { repo, saved, writer } = await setup();
    writer.edit({ ...saved, title: 'Unsaved work' });
    const copy = await duplicateSession(repo, writer.snapshot);
    expect(copy.id).not.toBe(saved.id);
    expect((await repo.load(copy.id)).title).toBe('Unsaved work (copy)');
    expect((await repo.load(saved.id)).title).toBe('Example');
    expect(writer.dirty).toBe(true);
    writer.dispose();
  });
});

it('reopen cancels scheduled edits without writing them', async () => {
  vi.useFakeTimers();
  const { repo, saved, writer } = await setup();
  const save = vi.spyOn(repo, 'save');
  writer.edit({ ...saved, title: 'Discard' });
  await writer.cancelPendingAndWait();
  await vi.advanceTimersByTimeAsync(1000);
  expect(save).not.toHaveBeenCalled();
  expect((await repo.load(saved.id)).title).toBe('Example');
  writer.dispose();
});
it('reopen waits for an existing atomic write to settle before reading disk', async () => {
  const { repo, saved, writer } = await setup();
  let release!: (session: Session) => void;
  const real = repo.save.bind(repo);
  vi.spyOn(repo, 'save').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  writer.edit({ ...saved, title: 'In flight' });
  const flush = writer.flush();
  writer.edit({ ...saved, title: 'Must be discarded' });
  let settled = false;
  const stopping = writer.cancelPendingAndWait().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  release(await real({ ...saved, title: 'In flight' }, saved.updatedAt));
  await Promise.all([flush, stopping]);
  expect(settled).toBe(true);
  expect(repo.save).toHaveBeenCalledTimes(1);
  expect((await repo.load(saved.id)).title).toBe('In flight');
  writer.dispose();
});
