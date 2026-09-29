import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaResolver, mediaKind } from './MediaResolver';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function restoreUrlMethod(
  name: 'createObjectURL' | 'revokeObjectURL',
  value: typeof URL.createObjectURL | typeof URL.revokeObjectURL,
) {
  if (value) {
    Object.defineProperty(URL, name, { configurable: true, value });
  } else {
    Reflect.deleteProperty(URL, name);
  }
}

describe('MediaResolver', () => {
  const createObjectURL = vi.fn(() => 'blob:test');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    restoreUrlMethod('createObjectURL', originalCreateObjectURL);
    restoreUrlMethod('revokeObjectURL', originalRevokeObjectURL);
    vi.restoreAllMocks();
  });

  it('classifies supported local media and rejects unsupported files', () => {
    expect(mediaKind(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(
      'image',
    );
    expect(mediaKind(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe(
      'gif',
    );
    expect(mediaKind(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).toBe(
      'video',
    );
    expect(mediaKind(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBeNull();
  });

  it('persists, resolves and revokes an object URL', async () => {
    const resolver = new MediaResolver(indexedDB);
    const asset = await resolver.import(
      new File(['image'], 'a.webp', { type: 'image/webp', lastModified: 1 }),
    );
    expect((await resolver.resolve(asset.id))?.url).toBe('blob:test');
    resolver.revoke(asset.id);
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    resolver.dispose();
  });

  it('returns null for a missing asset', async () => {
    expect(await new MediaResolver(indexedDB).resolve('missing')).toBeNull();
  });
});
