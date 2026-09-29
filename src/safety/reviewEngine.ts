import type { SafetyReview, Session } from '../domain/schema';
import { reviewRules, type ReviewSeverity } from './rules';

export const SCANNER_VERSION = '1.0.0';

function findingId(
  ruleId: string,
  blockId: string,
  start: number,
  end: number,
  text: string,
) {
  let hash = 2166136261;
  const value = `${ruleId}|${blockId}|${start}|${end}|${text}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${ruleId}:${blockId}:${(hash >>> 0).toString(16)}`;
}

const structuralDefinitions: ReadonlyArray<{
  id: string;
  label: string;
  severity: ReviewSeverity;
  test: (session: Session) => boolean;
  explanation: string;
}> = [
  {
    id: 'preflight',
    label: 'Preflight',
    severity: 'warning',
    test: (session) =>
      session.blocks.some(
        (block) => block.enabled && block.type === 'preflight',
      ),
    explanation:
      'An enabled preflight block gives the user a place to confirm ordinary readiness before future playback.',
  },
  {
    id: 'arrival',
    label: 'Opening / arrival',
    severity: 'info',
    test: (session) =>
      session.blocks.some((block) => block.enabled && block.type === 'arrival'),
    explanation: 'An enabled arrival block provides a clear opening stage.',
  },
  {
    id: 'stop-reminder',
    label: 'Stop reminder',
    severity: 'required-review',
    test: (session) =>
      session.blocks.some(
        (block) =>
          block.enabled &&
          (block.type === 'preflight' || block.type === 'arrival') &&
          /\b(?:you\s+can|free\s+to)\s+(?:stop|end|leave)\b|\bstop\s+(?:the\s+)?session\b|\breturn\s+now\b/iu.test(
            `${block.title}\n${block.narration}`,
          ),
      ),
    explanation:
      'No clear stop reminder was found in an enabled preflight or arrival block.',
  },
  {
    id: 'return',
    label: 'Return',
    severity: 'required-review',
    test: (session) =>
      session.blocks.some((block) => block.enabled && block.type === 'return'),
    explanation:
      'An enabled Return block is structurally required for immersive session review.',
  },
  {
    id: 'clean-exit',
    label: 'Clean Exit',
    severity: 'required-review',
    test: (session) =>
      session.blocks.some((block) => block.enabled && block.type === 'exit'),
    explanation:
      'An enabled Clean Exit block is structurally required for immersive session review.',
  },
];

export function structuralChecks(
  session: Session,
): SafetyReview['structuralChecks'] {
  return structuralDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    severity: definition.severity,
    status: definition.test(session) ? ('pass' as const) : ('missing' as const),
    explanation: definition.explanation,
  }));
}

export function scanSession(
  session: Session,
  previous: SafetyReview = session.safetyReview,
  now = new Date(),
): SafetyReview {
  const current = [];
  for (const block of session.blocks) {
    for (const rule of reviewRules) {
      for (const pattern of rule.searchPatterns) {
        const expression = new RegExp(pattern.source, pattern.flags);
        for (const match of block.narration.matchAll(expression)) {
          if (match.index === undefined || !match[0]) continue;
          const startOffset = match.index;
          const endOffset = startOffset + match[0].length;
          const id = findingId(
            rule.id,
            block.id,
            startOffset,
            endOffset,
            match[0],
          );
          const old = previous.findings.find((finding) => finding.id === id);
          current.push({
            id,
            ruleId: rule.id,
            blockId: block.id,
            severity: rule.severity,
            category: rule.category,
            matchedText: match[0],
            startOffset,
            endOffset,
            status:
              old?.status === 'dismissed' || old?.status === 'reviewed'
                ? old.status
                : ('unresolved' as const),
            note: old?.note ?? '',
            present: true,
          });
        }
      }
    }
  }

  const currentIds = new Set(current.map((finding) => finding.id));
  const history = previous.findings
    .filter((finding) => !currentIds.has(finding.id))
    .map((finding) => ({
      ...finding,
      present: false,
      status:
        finding.status === 'unresolved' ? ('edited' as const) : finding.status,
      note:
        finding.status === 'unresolved' && !finding.note
          ? 'No longer present in the current content after rescan.'
          : finding.note,
    }));
  const findings = [...current, ...history];
  const checks = structuralChecks(session);
  const unresolvedCount =
    current.filter((finding) => finding.status === 'unresolved').length +
    checks.filter(
      (check) =>
        check.status === 'missing' && check.severity === 'required-review',
    ).length;

  return {
    ...previous,
    status: 'not-reviewed',
    reviewedAt: null,
    lastScannedAt: now.toISOString(),
    scannerVersion: SCANNER_VERSION,
    findings,
    structuralChecks: checks,
    reviewerAcknowledged: false,
    unresolvedCount,
  };
}

export function updateFinding(
  review: SafetyReview,
  findingIdValue: string,
  status: 'reviewed' | 'dismissed',
  note = '',
): SafetyReview {
  if (status === 'dismissed' && !note.trim()) {
    throw new Error('A dismissal reason is required.');
  }
  const findings = review.findings.map((finding) =>
    finding.id === findingIdValue
      ? { ...finding, status, note: note.trim() || finding.note }
      : finding,
  );
  const unresolvedCount =
    findings.filter(
      (finding) => finding.present && finding.status === 'unresolved',
    ).length +
    review.structuralChecks.filter(
      (check) =>
        check.status === 'missing' && check.severity === 'required-review',
    ).length;
  return {
    ...review,
    status: 'not-reviewed',
    reviewedAt: null,
    findings,
    reviewerAcknowledged: false,
    unresolvedCount,
  };
}

export function canCompleteReview(review: SafetyReview): boolean {
  return Boolean(review.lastScannedAt) && review.unresolvedCount === 0;
}

export function completeReview(
  review: SafetyReview,
  now = new Date(),
): SafetyReview {
  if (!canCompleteReview(review)) {
    throw new Error(
      'Resolve or review required findings before completing review.',
    );
  }
  return {
    ...review,
    status: 'reviewed',
    reviewedAt: now.toISOString(),
    reviewerAcknowledged: true,
  };
}

export function invalidateReview(review: SafetyReview): SafetyReview {
  if (!review.lastScannedAt && review.status === 'not-reviewed') return review;
  return {
    ...review,
    status: 'not-reviewed',
    reviewedAt: null,
    reviewerAcknowledged: false,
  };
}
