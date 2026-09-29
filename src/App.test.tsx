import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { memoryRepository } from './test/memoryRepository';
import { newSession, defaultSettings } from './domain/schema';
async function start() {
  const repo = memoryRepository();
  const user = userEvent.setup();
  const rendered = render(<App repo={repo} />);
  await screen.findByRole('button', { name: 'New session' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled(),
  );
  return { repo, user, ...rendered };
}
describe('foundation views', () => {
  it('creates, edits, flushes on navigation, and reopens a session', async () => {
    const { repo, user } = await start();
    await user.click(screen.getByRole('button', { name: 'New Session' }));
    await user.type(screen.getByLabelText('Session title'), 'Blank idea');
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    await screen.findByRole('heading', { name: 'Session editor' });
    await user.type(screen.getByLabelText('Description'), 'A structural note');
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    await screen.findByRole('heading', { name: 'Blank idea' });
    expect((await repo.list()).sessions[0].description).toBe(
      'A structural note',
    );
    await user.click(screen.getByRole('button', { name: 'Open Blank idea' }));
    expect(await screen.findByLabelText('Description')).toHaveValue(
      'A structural note',
    );
  });
  it('saves settings and loads them on remount', async () => {
    const { repo, user, unmount } = await start();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const voice = screen.getByLabelText('TTS voice identifier (placeholder)');
    await user.type(voice, 'local-voice-placeholder');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved locally.');
    unmount();
    render(<App repo={repo} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
      screen.getByLabelText('TTS voice identifier (placeholder)'),
    ).toHaveValue('local-voice-placeholder');
  });
  it('requires confirmation before moving a session to Trash', async () => {
    const { repo, user } = await start();
    await repo.save(newSession('Keep until confirmed', defaultSettings), null);
    const trash = vi.spyOn(repo, 'trash');
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Delete Keep until confirmed',
      }),
    );
    expect(trash).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(trash).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Delete Keep until confirmed' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Move to Trash',
      }),
    );
    await waitFor(() => expect(trash).toHaveBeenCalledOnce());
    await screen.findByText('No sessions yet');
  });
  it('preserves editor and blocks navigation when saving fails', async () => {
    const { repo, user } = await start();
    await repo.save(newSession('Existing', defaultSettings), null);
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open Existing' }),
    );
    vi.spyOn(repo, 'save').mockRejectedValue(new Error('Disk full'));
    await user.type(screen.getByLabelText('Description'), 'Keep these edits');
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'local operation could not be completed',
    );
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Keep these edits',
    );
    expect(screen.getByText('Not saved — retry')).toBeInTheDocument();
  });
  it('shows corrupt file diagnostics alongside valid sessions', async () => {
    const repo = memoryRepository();
    const session = newSession('Valid', defaultSettings);
    vi.spyOn(repo, 'list').mockResolvedValue({
      sessions: [session],
      issues: [
        {
          file: 'broken.json',
          message: 'Malformed JSON. Original file unchanged.',
        },
      ],
    });
    const user = userEvent.setup();
    render(<App repo={repo} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    expect(await screen.findByText('broken.json')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Valid' })).toBeInTheDocument();
  });
  it('does not present browser preview as a saved desktop workspace', () => {
    render(<App />);
    expect(screen.getByText(/Browser preview only/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New session' })).toBeDisabled();
  });
});

it('renames and duplicates sessions through the list actions', async () => {
  const { repo, user } = await start();
  await repo.save(newSession('Original', defaultSettings), null);
  await user.click(screen.getByRole('button', { name: 'Sessions' }));
  await user.click(
    await screen.findByRole('button', { name: 'Rename Original' }),
  );
  await user.clear(screen.getByLabelText('New title'));
  await user.type(screen.getByLabelText('New title'), 'Renamed');
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Rename' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Duplicate Renamed' }),
  );
  await screen.findByRole('heading', { name: 'Renamed (copy)' });
  expect((await repo.list()).sessions).toHaveLength(2);
});
it('offers confirmed recovery from a save conflict without trapping the editor', async () => {
  const { repo, user } = await start();
  const original = await repo.save(
    newSession('Original', defaultSettings),
    null,
  );
  await user.click(screen.getByRole('button', { name: 'Sessions' }));
  await user.click(
    await screen.findByRole('button', { name: 'Open Original' }),
  );
  await repo.save(
    { ...original, description: 'Disk version' },
    original.updatedAt,
  );
  await user.type(screen.getByLabelText('Description'), 'My unsaved edits');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Not saved — retry');
  await user.click(screen.getByRole('button', { name: 'Save as copy' }));
  await waitFor(async () =>
    expect((await repo.list()).sessions).toHaveLength(2),
  );
  await user.click(
    screen.getByRole('button', { name: 'Reopen saved version' }),
  );
  await user.click(screen.getByRole('button', { name: 'Discard and reopen' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Description')).toHaveValue('Disk version'),
  );
  expect(
    (await repo.list()).sessions.find((s) => s.id !== original.id)?.description,
  ).toBe('My unsaved edits');
});
