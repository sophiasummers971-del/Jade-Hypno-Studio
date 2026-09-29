import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { memoryRepository } from './test/memoryRepository';

describe('Milestone 3 app workflow', () => {
  it('opens dedicated review from the editor and exposes RETURN NOW globally', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository()} lifecycle={async () => () => undefined} />);
    const newSessionButtons = await screen.findAllByRole('button', { name: /New session/i });
    await user.click(newSessionButtons[0]);
    await user.type(screen.getByLabelText('Session title'), 'Review workflow');
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('heading', { name: 'Session editor' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review session' }));
    expect(await screen.findByRole('heading', { name: 'Session Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RETURN NOW' })).toBeInTheDocument();
  });
});
