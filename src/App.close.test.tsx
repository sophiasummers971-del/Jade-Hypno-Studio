import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { memoryRepository } from './test/memoryRepository';
const windowMock = vi.hoisted(() => ({
  callback: undefined as
    undefined | ((event: { preventDefault: () => void }) => Promise<void>),
  destroy: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    destroy: windowMock.destroy,
    onCloseRequested: async (callback: typeof windowMock.callback) => {
      windowMock.callback = callback;
      return () => {
        windowMock.callback = undefined;
      };
    },
  }),
}));
beforeEach(() => {
  windowMock.destroy.mockReset();
});
it('flushes pending settings before permitting native destruction', async () => {
  const repo = memoryRepository();
  const user = userEvent.setup();
  render(<App repo={repo} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.type(
    screen.getByLabelText('TTS voice identifier (placeholder)'),
    'Remember me',
  );
  windowMock.destroy.mockImplementation(async () => {
    expect((await repo.loadSettings()).defaultVoiceId).toBe('Remember me');
  });
  const preventDefault = vi.fn();
  await act(async () => {
    await windowMock.callback?.({ preventDefault });
  });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(windowMock.destroy).toHaveBeenCalledOnce();
});
it('keeps the native window open if closing cannot save settings', async () => {
  const repo = memoryRepository();
  const user = userEvent.setup();
  render(<App repo={repo} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.type(
    screen.getByLabelText('TTS voice identifier (placeholder)'),
    'Unsaved',
  );
  vi.spyOn(repo, 'saveSettings').mockRejectedValue(new Error('Disk full'));
  await act(async () => {
    await windowMock.callback?.({ preventDefault: vi.fn() });
  });
  expect(windowMock.destroy).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('window remains open');
});
