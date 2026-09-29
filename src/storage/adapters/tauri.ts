import { invoke } from '@tauri-apps/api/core';
import { SessionSchema, SettingsSchema } from '../../domain/schema';
import { ListSchema, type Repository } from '../repository';
import { IndexedDBRepository } from './indexeddb';
const experimentStorage = new IndexedDBRepository({
  name: 'jade-hypno-studio-tauri-experiments',
});
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
  async listExperiments(sessionId) {
    return experimentStorage.listExperiments(sessionId);
  },
  async saveExperiment(record, expectedUpdatedAt) {
    return experimentStorage.saveExperiment(record, expectedUpdatedAt);
  },
  async deleteExperiment(id, expectedUpdatedAt) {
    return experimentStorage.deleteExperiment(id, expectedUpdatedAt);
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
