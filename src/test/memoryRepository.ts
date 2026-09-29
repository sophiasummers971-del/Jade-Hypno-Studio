import {
  SessionSchema,
  SettingsSchema,
  defaultSettings,
} from '../domain/schema';
import type { Repository } from '../storage/repository';
import { ExperimentRecordSchema } from '../experiment/model';
/** Test double only. Production has no browser or memory persistence fallback. */
export function memoryRepository(): Repository {
  const files = new Map<string, string>();
  let preferences = JSON.stringify(defaultSettings);
  const experiments = new Map<string, string>();
  let tick = Date.now();
  return {
    async list() {
      return {
        sessions: [...files.values()].map((v) =>
          SessionSchema.parse(JSON.parse(v)),
        ),
        issues: [],
      };
    },
    async load(id) {
      const value = files.get(id);
      if (!value) throw new Error('Not found');
      return SessionSchema.parse(JSON.parse(value));
    },
    async save(session, expected) {
      SessionSchema.parse(session);
      const old = files.get(session.id);
      if ((old && JSON.parse(old).updatedAt !== expected) || (!old && expected))
        throw new Error('Conflict');
      tick = Math.max(Date.now(), tick + 1, Date.parse(session.createdAt));
      const result = { ...session, updatedAt: new Date(tick).toISOString() };
      files.set(session.id, JSON.stringify(result));
      return result;
    },
    async trash(id) {
      files.delete(id);
    },
    async listExperiments(sessionId) {
      return [...experiments.values()]
        .map((value) => ExperimentRecordSchema.parse(JSON.parse(value)))
        .filter((record) => !sessionId || record.sessionId === sessionId)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    },
    async saveExperiment(record, expectedUpdatedAt) {
      const input = ExperimentRecordSchema.parse(record);
      const old = experiments.get(input.id);
      if (
        (old && JSON.parse(old).updatedAt !== expectedUpdatedAt) ||
        (!old && expectedUpdatedAt)
      )
        throw new Error('Conflict');
      tick = Math.max(Date.now(), tick + 1, Date.parse(input.createdAt));
      const saved = ExperimentRecordSchema.parse({
        ...input,
        updatedAt: new Date(tick).toISOString(),
      });
      experiments.set(saved.id, JSON.stringify(saved));
      return saved;
    },
    async deleteExperiment(id, expectedUpdatedAt) {
      const old = experiments.get(id);
      if (!old || JSON.parse(old).updatedAt !== expectedUpdatedAt)
        throw new Error('Conflict');
      experiments.delete(id);
    },
    async loadSettings() {
      return SettingsSchema.parse(JSON.parse(preferences));
    },
    async saveSettings(settings) {
      preferences = JSON.stringify(SettingsSchema.parse(settings));
      return JSON.parse(preferences);
    },
  };
}
