import { IndexedDBRepository } from '../storage/adapters/indexeddb';
import type { Lifecycle, Platform } from './contracts';
export const webLifecycle: Lifecycle = async ({ isDirty, flush, report }) => {
  const save = () => {
    void flush().catch((problem) =>
      report(
        'Background save failed. Keep the app open and save or export your edits.',
        problem,
      ),
    );
  };
  const hidden = () => {
    if (document.visibilityState === 'hidden') save();
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', save);
    window.removeEventListener('beforeunload', beforeUnload);
  };
};
export const platform: Platform = {
  repository: new IndexedDBRepository(),
  lifecycle: webLifecycle,
  storageLabel: 'IndexedDB on this device',
};
