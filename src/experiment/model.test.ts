import { describe, expect, it } from 'vitest';
import { newSession, defaultSettings } from '../domain/schema';
import { newExperimentRecord, summarizeExperiments } from './model';

describe('experiment model', () => {
  it('creates a versioned record linked to a session snapshot', () => {
    const session = newSession('Quiet run', defaultSettings);
    const record = newExperimentRecord({
      sessionId: session.id,
      sessionTitle: session.title,
      sessionRevision: session.updatedAt,
      completedAt: new Date().toISOString(),
      durationSeconds: 120,
    });
    expect(record.sessionId).toBe(session.id);
    expect(record.sessionTitle).toBe('Quiet run');
    expect(record.schemaVersion).toBe(1);
  });

  it('calculates descriptive averages and recent-vs-earlier values', () => {
    const session = newSession('A', defaultSettings);
    const first = newExperimentRecord({
      sessionId: session.id,
      sessionTitle: session.title,
      sessionRevision: session.updatedAt,
      completedAt: '2026-01-01T00:00:00.000Z',
      durationSeconds: 60,
    });
    const second = {
      ...first,
      id: crypto.randomUUID(),
      completedAt: '2026-01-02T00:00:00.000Z',
      ratings: { ...first.ratings },
    };
    first.ratings.relaxation = 2;
    second.ratings.relaxation = 4;
    const summary = summarizeExperiments([second, first]);
    expect(summary.count).toBe(2);
    expect(summary.averages.relaxation).toBe(3);
    expect(summary.earlierAverages.relaxation).toBe(2);
    expect(summary.recentAverages.relaxation).toBe(4);
  });
});
