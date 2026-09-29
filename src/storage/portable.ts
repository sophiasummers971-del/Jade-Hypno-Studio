import { parseSession, SessionSchema, type Session } from '../domain/schema';
import { randomId } from '../domain/uuid';
import type { SessionRepository } from './repository';
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export function exportSessionJson(session: Session): string {
  const json = JSON.stringify(SessionSchema.parse(session), null, 2) + '\n';
  if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES)
    throw new Error('Session exceeds the 4 MiB portable JSON limit.');
  return json;
}
export async function importSessionJson(
  repo: SessionRepository,
  json: string,
): Promise<Session> {
  if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES)
    throw new Error('Import exceeds the 4 MiB limit. No data was changed.');
  const validated = parseSession(json);
  // Always allocate a new identity. Import can never overwrite an active or trashed original.
  const now = new Date().toISOString();
  return repo.save(
    { ...validated, id: randomId(), createdAt: now, updatedAt: now },
    null,
  );
}
export function readJsonFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES)
    return Promise.reject(
      new Error('Import exceeds the 4 MiB limit. No data was changed.'),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        new Error('Could not read the selected file. No data was changed.'),
      );
    reader.onabort = () => reject(new Error('File selection was cancelled.'));
    reader.readAsText(file);
  });
}
/** Browser/WebView download handoff; host completion cannot be observed. Never uploads. */
export function downloadSession(session: Session): void {
  const json = exportSessionJson(session);
  const url = URL.createObjectURL(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `jade-session-${session.id}.json`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
