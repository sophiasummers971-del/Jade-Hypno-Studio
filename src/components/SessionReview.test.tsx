import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createSessionFromTemplate } from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';
import { scanSession } from '../safety/reviewEngine';
import { SessionReview } from './SessionReview';

describe('SessionReview', () => {
  it('shows structural checks, finding context and persistent review actions', async () => {
    const user = userEvent.setup();
    const session = createSessionFromTemplate('Review UI', 'immersive-fantasy', defaultSettings);
    const preflight = session.blocks.find((block) => block.type === 'preflight')!;
    preflight.narration = 'You can stop the session at any time.';
    const main = session.blocks.find((block) => block.type === 'main')!;
    main.narration = 'Tomorrow you must repeat the neutral task.';
    session.safetyReview = scanSession(session);
    const onChange = vi.fn();

    render(
      <SessionReview
        session={session}
        onChange={onChange}
        onReturnEditor={vi.fn()}
        onJumpToBlock={vi.fn()}
        onGrounding={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Session Review' })).toBeInTheDocument();
    expect(screen.getByText('persistent-post-session')).toBeInTheDocument();
    expect(screen.getByText(/Tomorrow you must repeat/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Dismissal reason'), 'Reviewed as a bounded example.');
    await user.click(screen.getByRole('button', { name: 'Dismiss with reason' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyReview: expect.objectContaining({
          findings: expect.arrayContaining([
            expect.objectContaining({ status: 'dismissed', note: 'Reviewed as a bounded example.' }),
          ]),
        }),
      }),
    );
  });

  it('offers grounding after an explicit unstable preflight answer', async () => {
    const user = userEvent.setup();
    const session = createSessionFromTemplate('Grounding path', 'blank', defaultSettings);
    session.safetyReview = scanSession(session);
    const onGrounding = vi.fn();
    render(
      <SessionReview
        session={session}
        onChange={vi.fn()}
        onReturnEditor={vi.fn()}
        onJumpToBlock={vi.fn()}
        onGrounding={onGrounding}
      />,
    );
    const notNow = screen.getAllByRole('button', { name: 'Not right now' });
    await user.click(notNow[1]);
    expect(screen.getByText(/Immersive playback should not be the next step/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Calm / Grounding Mode' }));
    expect(onGrounding).toHaveBeenCalledOnce();
  });
});
