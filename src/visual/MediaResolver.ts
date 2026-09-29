import type { ResolvedMedia, VisualAsset, VisualMediaKind } from './types';

const DB = 'jade-hypno-studio-media';
const STORE = 'assets';
const VERSION = 1;
const MAX_MEDIA_BYTES = 128 * 1024 * 1024;

export function mediaKind(
  file: Pick<File, 'type' | 'name'>,
): VisualMediaKind | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'image/gif' || name.endsWith('.gif')) return 'gif';
  if (
    ['image/png', 'image/jpeg', 'image/webp'].includes(type) ||
    /\.(png|jpe?g|webp)$/.test(name)
  )
    return 'image';
  if (['video/mp4', 'video/webm'].includes(type) || /\.(mp4|webm)$/.test(name))
    return 'video';
  return null;
}

export class MediaResolver {
  private db?: Promise<IDBDatabase>;
  private urls = new Map<string, string>();
  constructor(private factory: IDBFactory | undefined = globalThis.indexedDB) {}
  private open() {
    if (this.db) return this.db;
    this.db = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory)
        return reject(
          new Error('IndexedDB is unavailable for local visual media.'),
        );
      const request = this.factory.open(DB, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE);
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error('Could not open visual media storage.'),
        );
      request.onsuccess = () => resolve(request.result);
    });
    return this.db;
  }
  private async tx<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, done: (value: T) => void) => void,
  ) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () =>
        reject(tx.error ?? new Error('Visual media storage failed.'));
      tx.onabort = tx.onerror;
      work(tx.objectStore(STORE), (next) => {
        value = next;
      });
    });
  }
  async import(file: File): Promise<Omit<VisualAsset, 'blob'>> {
    const kind = mediaKind(file);
    if (!kind)
      throw new Error(
        'Unsupported visual media. Choose PNG, JPG, WebP, GIF, MP4, or WebM.',
      );
    if (file.size > MAX_MEDIA_BYTES)
      throw new Error('Visual media exceeds the 128 MiB local asset limit.');
    const id = `visual:${file.name}:${file.size}:${file.lastModified}`;
    const asset: VisualAsset = {
      id,
      name: file.name,
      mimeType: file.type || (kind === 'video' ? 'video/mp4' : 'image/*'),
      kind,
      size: file.size,
      blob: file,
    };
    await this.tx<void>('readwrite', (store, done) => {
      store.put(asset, id);
      done(undefined);
    });
    return {
      id,
      name: asset.name,
      mimeType: asset.mimeType,
      kind,
      size: asset.size,
    };
  }
  async resolve(id: string): Promise<ResolvedMedia | null> {
    if (!id) return null;
    return this.tx<ResolvedMedia | null>('readonly', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const asset = request.result as VisualAsset | undefined;
        if (!asset) return done(null);
        this.revoke(id);
        const url = URL.createObjectURL(asset.blob);
        this.urls.set(id, url);
        done({
          asset: {
            id: asset.id,
            name: asset.name,
            mimeType: asset.mimeType,
            kind: asset.kind,
            size: asset.size,
          },
          url,
        });
      };
    });
  }
  revoke(id: string) {
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
  }
  revokeAll() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
  async cleanupOrphans(references: Set<string>) {
    await this.tx<void>('readwrite', (store, done) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return done(undefined);
        if (!references.has(String(row.key))) {
          this.revoke(String(row.key));
          row.delete();
        }
        row.continue();
      };
    });
  }
  dispose() {
    this.revokeAll();
    void this.db?.then((db) => db.close());
    this.db = undefined;
  }
}
