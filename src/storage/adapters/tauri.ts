import { invoke } from '@tauri-apps/api/core';
import { SessionSchema, SettingsSchema } from '../../domain/schema';
import { ListSchema, type Repository } from '../repository';
export const tauriRepository: Repository = {
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
