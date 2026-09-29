import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import {
  SessionSchema,
  SettingsSchema,
  type Session,
  type Settings,
  copySession,
} from '../domain/schema';
export const ListSchema = z.object({
  sessions: z.array(SessionSchema),
  issues: z.array(z.object({ file: z.string(), message: z.string() })),
});
export type SessionList = z.infer<typeof ListSchema>;
export interface Repository {
  list(): Promise<SessionList>;
  load(id: string): Promise<Session>;
  save(session: Session, expectedUpdatedAt: string | null): Promise<Session>;
  trash(id: string, expectedUpdatedAt: string): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
}
export const repository: Repository = {
  async list() {
    return ListSchema.parse(await invoke('list_sessions'));
  },
  async load(id) {
    return SessionSchema.parse(await invoke('load_session', { id }));
  },
  async save(session, expectedUpdatedAt) {
    return SessionSchema.parse(
      await invoke('save_session', {
        session: SessionSchema.parse(session),
        expectedUpdatedAt,
      }),
    );
  },
  async trash(id, expectedUpdatedAt) {
    await invoke('trash_session', { id, expectedUpdatedAt });
  },
  async loadSettings() {
    return SettingsSchema.parse(await invoke('load_settings'));
  },
  async saveSettings(settings) {
    return SettingsSchema.parse(
      await invoke('save_settings', {
        settings: SettingsSchema.parse(settings),
      }),
    );
  },
};
export async function duplicateSession(repo: Repository, session: Session) {
  return repo.save(copySession(session), null);
}
