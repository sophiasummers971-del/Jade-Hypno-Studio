import { z } from 'zod';
import {
  SessionSchema,
  SettingsSchema,
  defaultSettings,
  type Session,
  type Settings,
} from '../../domain/schema';
import type { Repository, SessionList } from '../repository';
import { ExperimentRecordSchema, type ExperimentRecord } from '../../experiment/model';

const STORE_VERSION = 2;
export const DATABASE_NAME = 'jade-hypno-studio';
const SETTINGS_KEY = 'preferences';
const MAX_BYTES = 4 * 1024 * 1024;
const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const TrashSchema = z
  .object({ session: SessionSchema, deletedAt: z.string().datetime() })
  .strict();
function validateSession(value: unknown, id?: IDBValidKey): Session {
  const result = SessionSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      `Invalid stored session at ${result.error.issues.map((i) => i.path.join('.') || 'root').join(', ')}. Original record unchanged.`,
    );
  if (id !== undefined && result.data.id !== id)
    throw new Error(
      'Session ID differs from its storage key. Original record unchanged.',
    );
  bounded(result.data);
  return result.data;
}
function bounded(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES)
    throw new Error('Session exceeds the 4 MiB storage limit.');
}
function storageError(error: unknown): Error {
  if (error instanceof Error && error.name === 'QuotaExceededError')
    return new Error(
      'Device storage quota is full. Your edits have not been saved. Export a JSON copy before clearing any app data.',
    );
  if (error instanceof Error) return error;
  return new Error(
    'Local storage operation failed. Keep this window open and export your draft if possible.',
  );
}

/** All read/validate/write sequences share one transaction. Success means oncomplete, not request success. */
export class IndexedDBRepository implements Repository {
  private connection: Promise<IDBDatabase> | undefined;
  constructor(private options: { name?: string; factory?: IDBFactory } = {}) {}
  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      let settled = false;
      try {
        const factory = this.options.factory ?? globalThis.indexedDB;
        if (!factory)
          throw new Error(
            'IndexedDB is unavailable. Enable persistent WebView storage; no temporary storage fallback is used.',
          );
        const request = factory.open(
          this.options.name ?? DATABASE_NAME,
          STORE_VERSION,
        );
        const fail = (error: unknown) => {
          settled = true;
          this.connection = undefined;
          reject(storageError(error));
        };
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ['sessions', 'settings', 'trash', 'experiments'])
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        };
        request.onerror = () => fail(request.error);
        request.onblocked = () =>
          fail(
            new Error(
              'Storage upgrade is blocked by another open window. Close other studio windows and reopen.',
            ),
          );
        request.onsuccess = () => {
          const db = request.result;
          if (settled) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.connection = undefined;
          };
          db.onclose = () => {
            this.connection = undefined;
          };
          resolve(db);
        };
      } catch (error) {
        reject(storageError(error));
      }
    });
    return this.connection;
  }
  async close() {
    const connection = this.connection;
    this.connection = undefined;
    (await connection)?.close();
  }
  private async transaction<T>(
    names: string[],
    mode: IDBTransactionMode,
    work: (
      tx: IDBTransaction,
      result: (value: T) => void,
      guard: (action: () => void) => void,
    ) => void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(names, mode);
      } catch (error) {
        reject(storageError(error));
        return;
      }
      let value: T;
      let failure: unknown;
      const guard = (action: () => void) => {
        try {
          action();
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () =>
        reject(
          storageError(
            failure ??
              tx.error ??
              new Error(
                'Local storage transaction was aborted. Nothing in this transaction was saved.',
              ),
          ),
        );
      // Leave the default error action intact so request failures abort the entire transaction.
      tx.onerror = () => {
        failure ??= tx.error;
      };
      guard(() =>
        work(
          tx,
          (result) => {
            value = result;
          },
          guard,
        ),
      );
    });
  }
  list(): Promise<SessionList> {
    return this.transaction(['sessions'], 'readonly', (tx, done) => {
      const result: SessionList = { sessions: [], issues: [] };
      const cursor = tx.objectStore('sessions').openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) {
          result.sessions.sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          );
          done(result);
          return;
        }
        try {
          result.sessions.push(validateSession(row.value, row.key));
        } catch (error) {
          result.issues.push({
            file: String(row.key),
            message: storageError(error).message,
          });
        }
        row.continue();
      };
    });
  }
  async load(id: string): Promise<Session> {
    idSchema.parse(id);
    return this.transaction(['sessions'], 'readonly', (tx, done, guard) => {
      const request = tx.objectStore('sessions').get(id);
      request.onsuccess = () =>
        guard(() => {
          if (request.result === undefined)
            throw new Error('Session not found.');
          done(validateSession(request.result, id));
        });
    });
  }
  async save(
    session: Session,
    expectedUpdatedAt: string | null,
  ): Promise<Session> {
    const input = SessionSchema.parse(session);
    bounded(input);
    return this.transaction(
      ['sessions', 'trash'],
      'readwrite',
      (tx, done, guard) => {
        const store = tx.objectStore('sessions');
        const request = store.get(input.id);
        request.onsuccess = () =>
          guard(() => {
            if (expectedUpdatedAt === null) {
              if (request.result !== undefined)
                throw new Error(
                  'Session ID already exists. Import or duplicate with a new ID instead.',
                );
              const deleted = tx.objectStore('trash').get(input.id);
              deleted.onsuccess = () =>
                guard(() => {
                  if (deleted.result !== undefined)
                    throw new Error(
                      'Session ID exists in Trash. Create a new ID or restore the original.',
                    );
                  const now = new Date().toISOString();
                  const saved = SessionSchema.parse({
                    ...input,
                    createdAt: now,
                    updatedAt: now,
                  });
                  store.add(saved, saved.id);
                  done(saved);
                });
            } else {
              const current = validateSession(request.result, input.id);
              if (current.updatedAt !== expectedUpdatedAt)
                throw new Error(
                  'Session changed in another window. Save your edits as a copy, then reopen the saved version.',
                );
              if (current.createdAt !== input.createdAt)
                throw new Error('Creation timestamp cannot change.');
              const updatedAt = new Date(
                Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
              ).toISOString();
              const saved = SessionSchema.parse({ ...input, updatedAt });
              store.put(saved, saved.id);
              done(saved);
            }
          });
      },
    );
  }
  async trash(id: string, expectedUpdatedAt: string): Promise<void> {
    idSchema.parse(id);
    return this.transaction(
      ['sessions', 'trash'],
      'readwrite',
      (tx, done, guard) => {
        const sessions = tx.objectStore('sessions');
        const request = sessions.get(id);
        request.onsuccess = () =>
          guard(() => {
            const session = validateSession(request.result, id);
            if (session.updatedAt !== expectedUpdatedAt)
              throw new Error('Session changed. Refresh before deleting.');
            tx.objectStore('trash').add(
              { session, deletedAt: new Date().toISOString() },
              id,
            );
            sessions.delete(id);
            done(undefined);
          });
      },
    );
  }
  /** Manual recovery API; no purge operation is exposed. */
  async restore(id: string): Promise<Session> {
    idSchema.parse(id);
    return this.transaction(
      ['sessions', 'trash'],
      'readwrite',
      (tx, done, guard) => {
        const request = tx.objectStore('trash').get(id);
        request.onsuccess = () =>
          guard(() => {
            const { session } = TrashSchema.parse(request.result);
            validateSession(session, id);
            tx.objectStore('sessions').add(session, id);
            tx.objectStore('trash').delete(id);
            done(session);
          });
      },
    );
  }
  listExperiments(sessionId?: string): Promise<ExperimentRecord[]> {
    return this.transaction(['experiments'], 'readonly', (tx, done, guard) => {
      const records: ExperimentRecord[] = [];
      const cursor = tx.objectStore('experiments').openCursor();
      cursor.onsuccess = () =>
        guard(() => {
          const row = cursor.result;
          if (!row) {
            records.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
            done(records);
            return;
          }
          const record = ExperimentRecordSchema.parse(row.value);
          if (record.id !== row.key) throw new Error('Experiment ID differs from its storage key.');
          if (!sessionId || record.sessionId === sessionId) records.push(record);
          row.continue();
        });
    });
  }
  saveExperiment(
    record: ExperimentRecord,
    expectedUpdatedAt: string | null,
  ): Promise<ExperimentRecord> {
    const input = ExperimentRecordSchema.parse(record);
    bounded(input);
    return this.transaction(['experiments'], 'readwrite', (tx, done, guard) => {
      const store = tx.objectStore('experiments');
      const request = store.get(input.id);
      request.onsuccess = () =>
        guard(() => {
          if (expectedUpdatedAt === null) {
            if (request.result !== undefined) throw new Error('Experiment record already exists.');
            store.add(input, input.id);
            done(input);
            return;
          }
          const current = ExperimentRecordSchema.parse(request.result);
          if (current.updatedAt !== expectedUpdatedAt)
            throw new Error('Observation changed in another window. Refresh before saving.');
          if (current.createdAt !== input.createdAt)
            throw new Error('Observation creation timestamp cannot change.');
          const updatedAt = new Date(
            Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
          ).toISOString();
          const saved = ExperimentRecordSchema.parse({ ...input, updatedAt });
          store.put(saved, saved.id);
          done(saved);
        });
    });
  }
  deleteExperiment(id: string, expectedUpdatedAt: string): Promise<void> {
    idSchema.parse(id);
    return this.transaction(['experiments'], 'readwrite', (tx, done, guard) => {
      const store = tx.objectStore('experiments');
      const request = store.get(id);
      request.onsuccess = () =>
        guard(() => {
          const current = ExperimentRecordSchema.parse(request.result);
          if (current.updatedAt !== expectedUpdatedAt)
            throw new Error('Observation changed in another window. Refresh before deleting.');
          store.delete(id);
          done(undefined);
        });
    });
  }
  loadSettings(): Promise<Settings> {
    return this.transaction(['settings'], 'readonly', (tx, done, guard) => {
      const request = tx.objectStore('settings').get(SETTINGS_KEY);
      request.onsuccess = () =>
        guard(() =>
          done(
            SettingsSchema.parse(
              request.result === undefined ? defaultSettings : request.result,
            ),
          ),
        );
    });
  }
  async saveSettings(settings: Settings): Promise<Settings> {
    const input = SettingsSchema.parse(settings);
    return this.transaction(['settings'], 'readwrite', (tx, done, guard) => {
      const store = tx.objectStore('settings');
      const request = store.get(SETTINGS_KEY);
      request.onsuccess = () =>
        guard(() => {
          if (request.result !== undefined)
            SettingsSchema.parse(request.result);
          store.put(input, SETTINGS_KEY);
          done(input);
        });
    });
  }
}
