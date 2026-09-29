import { expect, it, vi } from 'vitest';
import { webLifecycle } from './web';
it('flushes when backgrounded, reports failure and cleans listeners', async () => {
  const flush = vi.fn().mockRejectedValue(new Error('Storage full'));
  const report = vi.fn();
  const cleanup = await webLifecycle({
    isDirty: () => true,
    flush,
    requestClose: vi.fn(),
    report,
  });
  window.dispatchEvent(new Event('pagehide'));
  await vi.waitFor(() => expect(report).toHaveBeenCalled());
  expect(flush).toHaveBeenCalledOnce();
  cleanup();
  window.dispatchEvent(new Event('pagehide'));
  expect(flush).toHaveBeenCalledOnce();
});
it('warns before leaving only while there are unsaved edits', async () => {
  const isDirty = vi.fn(() => true);
  const cleanup = await webLifecycle({
    isDirty,
    flush: vi.fn(),
    requestClose: vi.fn(),
    report: vi.fn(),
  });
  const pending = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  isDirty.mockReturnValue(false);
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  cleanup();
});
