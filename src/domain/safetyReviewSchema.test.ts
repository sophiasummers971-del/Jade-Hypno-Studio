import { describe, expect, it } from 'vitest';
import {
  copySession,
  defaultSettings,
  newSession,
  type Session,
} from './schema';

describe('Milestone 3 review metadata contract', () => {
  it('starts sessions with versioned empty review metadata', () => {
    const session = newSession('Review me', defaultSettings);
    const review = (session as Session & { safetyReview: Record<string, unknown> })
      .safetyReview;
    expect(review.scannerVersion).toBe('');
    expect(review.findings).toEqual([]);
    expect(review.structuralChecks).toEqual([]);
    expect(review.reviewerAcknowledged).toBe(false);
    expect(review.unresolvedCount).toBe(0);
  });

  it('does not copy a completed review onto a duplicated session', () => {
    const source = newSession('Source', defaultSettings) as Session & {
      safetyReview: Record<string, unknown>;
    };
    source.safetyReview.status = 'reviewed';
    source.safetyReview.reviewerAcknowledged = true;
    source.safetyReview.scannerVersion = '1.0.0';
    source.safetyReview.findings = [{ id: 'old-review' }];

    const duplicate = copySession(source as Session) as Session & {
      safetyReview: Record<string, unknown>;
    };
    expect(duplicate.safetyReview.status).toBe('not-reviewed');
    expect(duplicate.safetyReview.reviewerAcknowledged).toBe(false);
    expect(duplicate.safetyReview.findings).toEqual([]);
  });
});
