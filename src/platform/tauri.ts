import { getCurrentWindow } from '@tauri-apps/api/window';
import { tauriRepository } from '../storage/adapters/tauri';
import type { Lifecycle, Platform } from './contracts';
export const tauriLifecycle: Lifecycle = async ({
  isDirty,
  requestClose,
  report,
}) => {
  const preventReload = (event: BeforeUnloadEvent) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', preventReload);
  try {
    const unlisten = await getCurrentWindow().onCloseRequested(
      async (event) => {
        event.preventDefault();
        try {
          if (await requestClose()) await getCurrentWindow().destroy();
        } catch (problem) {
          report('Could not close the desktop window.', problem);
        }
      },
    );
    return () => {
      unlisten();
      window.removeEventListener('beforeunload', preventReload);
    };
  } catch (error) {
    window.removeEventListener('beforeunload', preventReload);
    throw error;
  }
};
export const platform: Platform = {
  repository: tauriRepository,
  lifecycle: tauriLifecycle,
  storageLabel: 'JSON files in the application data folder',
};
