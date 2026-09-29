import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaResolver, mediaKind } from './MediaResolver';

describe('MediaResolver', () => {
  afterEach(() => vi.restoreAllMocks());
  it('classifies supported local media and rejects unsupported files', () => {
    expect(mediaKind(new File(['x'], 'a.png', {type:'image/png'}))).toBe('image');
    expect(mediaKind(new File(['x'], 'a.gif', {type:'image/gif'}))).toBe('gif');
    expect(mediaKind(new File(['x'], 'a.mp4', {type:'video/mp4'}))).toBe('video');
    expect(mediaKind(new File(['x'], 'a.txt', {type:'text/plain'}))).toBeNull();
  });
  it('persists, resolves and revokes an object URL', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(()=>{});
    const resolver = new MediaResolver(indexedDB);
    const asset = await resolver.import(new File(['image'], 'a.webp', {type:'image/webp', lastModified:1}));
    expect((await resolver.resolve(asset.id))?.url).toBe('blob:test');
    resolver.revoke(asset.id);
    expect(create).toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith('blob:test');
    resolver.dispose();
  });
  it('returns null for a missing asset', async () => { expect(await new MediaResolver(indexedDB).resolve('missing')).toBeNull(); });
});
