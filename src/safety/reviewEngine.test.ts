import { describe, expect, it } from 'vitest';
import { createBlock, createSessionFromTemplate } from '../domain/scriptBuilder';
import { defaultSettings, type Session } from '../domain/schema';
import { reviewFixtures } from './reviewFixtures';
import {
  SCANNER_VERSION,
  canCompleteReview,
  completeReview,
  scanSession,
  structuralChecks,
  updateFinding,
} from './reviewEngine';

function sessionWith(text: string): Session {
  const session = createSessionFromTemplate('Review fixture', 'immersive-fantasy', defaultSettings);
  const main = session.blocks.find((block) => block.type === 'main')!;
  main.narration = text;
  const preflight = session.blocks.find((block) => block.type === 'preflight')!;
  preflight.narration = 'You can stop the session at any time.';
  return session;
}

describe('local safety review scanner', () => {
  it.each([
    ['loss-of-choice', reviewFixtures.lossOfChoice],
    ['persistent-post-session', reviewFixtures.persistent],
    ['memory-interference', reviewFixtures.memory],
    ['reality-confusion', reviewFixtures.reality],
    ['dangerous-physical-activity', reviewFixtures.dangerous],
    ['intoxication', reviewFixtures.intoxication],
    ['self-harm', reviewFixtures.selfHarm],
  ])('detects %s', (category, text) => {
    const review = scanSession(sessionWith(text));
    expect(review.findings.some((finding) => finding.present && finding.category === category)).toBe(true);
  });

  it('does not treat benign rain or clearly framed fantasy as reality/control findings', () => {
    const review = scanSession(sessionWith(`${reviewFixtures.benignRain} ${reviewFixtures.benignFantasy}`));
    expect(review.findings.filter((finding) => finding.present)).toEqual([]);
  });

  it('reports the exact block, match and character range', () => {
    const session = sessionWith(`Before. ${reviewFixtures.memory} After.`);
    const main = session.blocks.find((block) => block.type === 'main')!;
    const finding = scanSession(session).findings.find((item) => item.present)!;
    expect(finding.blockId).toBe(main.id);
    expect(main.narration.slice(finding.startOffset, finding.endOffset)).toBe(finding.matchedText);
  });

  it('persists dismissals and their reason across rescans', () => {
    const session = sessionWith(reviewFixtures.persistent);
    const scanned = scanSession(session);
    const finding = scanned.findings.find((item) => item.present)!;
    session.safetyReview = updateFinding(scanned, finding.id, 'dismissed', 'Context reviewed and intentionally bounded.');
    const rescanned = scanSession(session, session.safetyReview);
    const same = rescanned.findings.find((item) => item.id === finding.id)!;
    expect(same.status).toBe('dismissed');
    expect(same.note).toContain('intentionally bounded');
    expect(rescanned.scannerVersion).toBe(SCANNER_VERSION);
  });

  it('keeps removed findings in audit history as edited', () => {
    const session = sessionWith(reviewFixtures.memory);
    session.safetyReview = scanSession(session);
    session.blocks.find((block) => block.type === 'main')!.narration = 'Ordinary neutral text.';
    const rescanned = scanSession(session, session.safetyReview);
    expect(rescanned.findings.some((finding) => !finding.present && finding.status === 'edited')).toBe(true);
  });

  it('finds missing Return and Clean Exit structural sections', () => {
    const session = sessionWith('Neutral text.');
    session.blocks = session.blocks.filter((block) => block.type !== 'return' && block.type !== 'exit');
    const checks = structuralChecks(session);
    expect(checks.find((check) => check.id === 'return')?.status).toBe('missing');
    expect(checks.find((check) => check.id === 'clean-exit')?.status).toBe('missing');
  });

  it('requires dismissal reasons and only completes a resolved review', () => {
    const session = sessionWith(reviewFixtures.persistent);
    let review = scanSession(session);
    const finding = review.findings.find((item) => item.present)!;
    expect(() => updateFinding(review, finding.id, 'dismissed')).toThrow(/reason/i);
    review = updateFinding(review, finding.id, 'reviewed');
    expect(canCompleteReview(review)).toBe(true);
    expect(completeReview(review).status).toBe('reviewed');
  });

  it('never modifies script text while scanning', () => {
    const session = sessionWith(reviewFixtures.selfHarm);
    const before = structuredClone(session.blocks);
    scanSession(session);
    expect(session.blocks).toEqual(before);
  });

  it('flags a missing stop reminder independently of block presence', () => {
    const session = createSessionFromTemplate('No reminder', 'immersive-fantasy', defaultSettings);
    expect(structuralChecks(session).find((check) => check.id === 'stop-reminder')?.status).toBe('missing');
  });

  it('handles a custom block without depending on a template ID', () => {
    const session = createSessionFromTemplate('Custom', 'blank', defaultSettings);
    session.blocks.push(createBlock('custom', 'Notes'));
    session.blocks[0].narration = reviewFixtures.memory;
    expect(scanSession(session).findings[0].blockId).toBe(session.blocks[0].id);
  });
});
