import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Session } from '../domain/schema';
import { createSessionFromTemplate } from '../domain/scriptBuilder';
import { ScriptBuilder } from './ScriptBuilder';

function Harness({
  initial,
  onSessionChange,
}: {
  initial: Session;
  onSessionChange?: (session: Session) => void;
}) {
  const [session, setSession] = useState(initial);
  const handleChange = (next: Session) => {
    setSession(next);
    onSessionChange?.(next);
  };
  return (
    <ScriptBuilder
      session={session}
      wordsPerMinute={150}
      onChange={handleChange}
    />
  );
}

describe('ScriptBuilder editor', () => {
  it('edits narration and private notes as separate fields', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={createSessionFromTemplate(
          'Edit',
          'relaxation',
          defaultSettings,
        )}
      />,
    );
    const narration = screen.getByLabelText('Spoken narration');
    const notes = screen.getByLabelText(/PRIVATE NOTES/);
    await user.type(narration, 'Speak this aloud.');
    await user.type(notes, 'Editor only.');
    expect(narration).toHaveValue('Speak this aloud.');
    expect(notes).toHaveValue('Editor only.');
    expect(screen.getByText(/3 words/)).toBeInTheDocument();
  });

  it('offers touch-friendly button reordering and independent duplication', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={createSessionFromTemplate(
          'Order',
          'relaxation',
          defaultSettings,
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: /02.*Arrival/i }));
    await user.click(screen.getByRole('button', { name: 'Move Up' }));
    const rows = within(
      screen.getByLabelText('Block list and timeline'),
    ).getAllByRole('button');
    expect(rows.some((row) => row.textContent?.includes('01Arrival'))).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Duplicate block' }));
    expect(screen.getByDisplayValue('Arrival (copy)')).toBeInTheDocument();
  });

  it('previews local text imports before adding proposed blocks and preserves source', async () => {
    const user = userEvent.setup();
    const onSessionChange = vi.fn();
    render(
      <Harness
        initial={createSessionFromTemplate('Import', 'blank', defaultSettings)}
        onSessionChange={onSessionChange}
      />,
    );
    const originalText = '# Arrival\nBreathe.\n\n# Return\nAwake.';
    const file = new File([originalText], 'sample.md', {
      type: 'text/markdown',
    });
    await user.upload(
      screen.getByLabelText('Import TXT or Markdown file'),
      file,
    );
    expect(
      await screen.findByRole('heading', { name: 'Review imported text' }),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Arrival')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm and add proposed blocks' }),
    );
    expect(screen.getByDisplayValue('Arrival')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Review imported text' }),
    ).not.toBeInTheDocument();
    const latestSession = onSessionChange.mock.calls.at(-1)?.[0] as Session;
    expect(latestSession.sourceImports).toHaveLength(1);
    expect(latestSession.sourceImports[0]).toMatchObject({
      fileName: 'sample.md',
      originalText,
    });
  });

  it('requires confirmation before deleting a populated block', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <Harness
        initial={createSessionFromTemplate(
          'Delete',
          'relaxation',
          defaultSettings,
        )}
      />,
    );
    await user.type(screen.getByLabelText('Spoken narration'), 'Keep me');
    await user.click(screen.getByRole('button', { name: 'Delete block' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByDisplayValue('Preflight')).toBeInTheDocument();
    confirm.mockRestore();
  });
});
