import {
  SessionSchema,
  SettingsSchema,
  defaultSettings,
} from '../domain/schema';
import type { Repository } from '../storage/repository';
/** Test double only. Production has no browser or memory persistence fallback. */
export function memoryRepository(): Repository {
  const files = new Map<string, string>();
  let preferences = JSON.stringify(defaultSettings);
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
    async loadSettings() {
      return SettingsSchema.parse(JSON.parse(preferences));
    },
    async saveSettings(settings) {
      preferences = JSON.stringify(SettingsSchema.parse(settings));
      return JSON.parse(preferences);
    },
  };
}
