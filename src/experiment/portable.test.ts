import { describe, expect, it } from 'vitest';
import { defaultSettings, newSession } from '../domain/schema';
import { memoryRepository } from '../test/memoryRepository';
import { newExperimentRecord } from './model';
import { exportExperimentsJson, importExperimentsJson } from './portable';

describe('experiment portable data', () => {
  it('round-trips versioned local observations without network access', async () => {
    const repo = memoryRepository();
    const session = newSession('Portable', defaultSettings);
    const record = newExperimentRecord({
      sessionId: session.id,
      sessionTitle: session.title,
      sessionRevision: session.updatedAt,
      completedAt: new Date().toISOString(),
      durationSeconds: 90,
    });
    const fetchBefore = globalThis.fetch;
    const count = await importExperimentsJson(
      repo,
      exportExperimentsJson([record]),
    );
    expect(count).toBe(1);
    expect((await repo.listExperiments())[0]?.sessionId).toBe(session.id);
    expect(globalThis.fetch).toBe(fetchBefore);
  });
});
