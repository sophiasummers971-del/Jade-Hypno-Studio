import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, newSession } from '../domain/schema';
import { newExperimentRecord } from '../experiment/model';
import { memoryRepository } from '../test/memoryRepository';
import { ExperimentLab } from './ExperimentLab';

describe('ExperimentLab', () => {
  it('can skip a pending post-completion observation without saving', async () => {
    const repo = memoryRepository();
    const session = newSession('Skip me', defaultSettings);
    const pending = newExperimentRecord({
      sessionId: session.id,
      sessionTitle: session.title,
      sessionRevision: session.updatedAt,
      completedAt: new Date().toISOString(),
      durationSeconds: 30,
    });
    const handled = vi.fn();
    const user = userEvent.setup();
    render(
      <ExperimentLab
        repo={repo}
        sessions={{ sessions: [session], issues: [] }}
        pending={pending}
        onPendingHandled={handled}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Skip / cancel' }));
    expect(await repo.listExperiments()).toEqual([]);
    expect(handled).toHaveBeenCalledOnce();
  });

  it('creates, edits, filters and deletes local observations while preserving deleted-session snapshots', async () => {
    const repo = memoryRepository();
    const session = newSession('Linked run', defaultSettings);
    const pending = newExperimentRecord({
      sessionId: session.id,
      sessionTitle: session.title,
      sessionRevision: session.updatedAt,
      completedAt: new Date().toISOString(),
      durationSeconds: 120,
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <ExperimentLab
        repo={repo}
        sessions={{ sessions: [session], issues: [] }}
        pending={pending}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/Comfort:/), '4');
    await user.type(screen.getByLabelText('Notes'), 'Felt steady');
    await user.click(screen.getByRole('button', { name: 'Save observation' }));
    expect((await repo.listExperiments())[0]?.ratings.comfort).toBe(4);
    expect(await screen.findByText('Felt steady')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Notes'));
    await user.type(screen.getByLabelText('Notes'), 'Edited note');
    await user.click(screen.getByRole('button', { name: 'Save observation' }));
    expect(await screen.findByText('Edited note')).toBeInTheDocument();

    rerender(
      <ExperimentLab repo={repo} sessions={{ sessions: [], issues: [] }} />,
    );
    expect(
      await screen.findByText(/Original session no longer in active library/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await repo.listExperiments()).toEqual([]);
  });

  it('does not use network APIs to browse history', async () => {
    const repo = memoryRepository();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <ExperimentLab repo={repo} sessions={{ sessions: [], issues: [] }} />,
    );
    await screen.findByText('No observations recorded for this filter.');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
