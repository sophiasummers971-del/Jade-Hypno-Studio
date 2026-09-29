export type ReviewSeverity = 'info' | 'warning' | 'required-review';

export type ReviewCategory =
  | 'loss-of-choice'
  | 'persistent-post-session'
  | 'memory-interference'
  | 'reality-confusion'
  | 'dangerous-physical-activity'
  | 'intoxication'
  | 'self-harm';

export type ReviewRule = {
  id: string;
  category: ReviewCategory;
  description: string;
  severity: ReviewSeverity;
  searchPatterns: readonly RegExp[];
  explanation: string;
  remediation: string;
};

export const reviewRules: readonly ReviewRule[] = [
  {
    id: 'choice-loss',
    category: 'loss-of-choice',
    description:
      'Language that may remove or reduce the user’s ability to stop or choose.',
    severity: 'required-review',
    searchPatterns: [
      /\b(?:cannot|can't|unable to)\s+(?:stop|end|leave|pause)\s+(?:this\s+|the\s+)?(?:session|experience|process|sequence)\b/giu,
      /\b(?:cannot|can't|unable to)\s+resist\b/giu,
      /\bmust\s+continue\b/giu,
      /\bhave\s+no\s+choice\b/giu,
      /\b(?:are\s+)?forced\s+to\s+continue\b/giu,
    ],
    explanation:
      'This wording may imply that stopping or choosing differently is unavailable.',
    remediation:
      'Review whether the wording preserves voluntary choice and an immediate ability to stop.',
  },
  {
    id: 'post-session-command',
    category: 'persistent-post-session',
    description: 'Language that may carry commands beyond the current session.',
    severity: 'warning',
    searchPatterns: [
      /\bfrom\s+now\s+on\b/giu,
      /\b(?:after|outside)\s+this\s+session\b/giu,
      /\bpermanent(?:ly)?\b|\bforever\b/giu,
      /\bwhenever\s+you\s+(?:hear|see|feel|notice)\b/giu,
      /\btomorrow\s+(?:you\s+)?(?:must|have\s+to)\b/giu,
    ],
    explanation:
      'The phrase may describe an instruction intended to remain active after the session.',
    remediation:
      'Confirm that any post-session wording is deliberate, bounded, voluntary, and easy to disregard.',
  },
  {
    id: 'memory-interference',
    category: 'memory-interference',
    description: 'Language that may interfere with remembering the session.',
    severity: 'required-review',
    searchPatterns: [
      /\bforget\s+(?:this|the)\s+session\b/giu,
      /\berase\s+(?:your\s+)?memor(?:y|ies)\b/giu,
      /\b(?:cannot|can't|unable to)\s+remember\b/giu,
      /\bamnesia\b/giu,
    ],
    explanation:
      'This wording may encourage forgetting, amnesia, or deliberate memory interference.',
    remediation:
      'Review whether memory interference is intended and remove it if clear recall should remain available.',
  },
  {
    id: 'reality-confusion',
    category: 'reality-confusion',
    description:
      'Assertions that may blur fantasy content with external reality.',
    severity: 'required-review',
    searchPatterns: [
      /\bnothing\s+around\s+you\s+is\s+real\b/giu,
      /\byour\s+hallucinations?\s+(?:are|is)\s+real\b/giu,
      /\bignore\s+(?:the\s+)?reality\b/giu,
      /\bforget\s+where\s+you\s+are\b/giu,
      /\bthe\s+real\s+world\s+does\s+not\s+exist\b/giu,
    ],
    explanation:
      'This is phrased as an assertion about external reality rather than ordinary imaginative framing.',
    remediation:
      'Prefer clearly framed imagination or fantasy language when describing fictional experiences.',
  },
  {
    id: 'dangerous-physical',
    category: 'dangerous-physical-activity',
    description:
      'Obvious physical activities that require full awareness or may create bodily risk.',
    severity: 'required-review',
    searchPatterns: [
      /\b(?:drive|driving)\b/giu,
      /\bcross(?:ing)?\s+(?:a\s+|the\s+)?road\b/giu,
      /\boperat(?:e|ing)\s+(?:heavy\s+)?machinery\b/giu,
      /\bweapon(?:s)?\b/giu,
      /\b(?:hold|stop|restrict)\s+(?:your\s+)?breath\b/giu,
      /\bchok(?:e|ing)\b/giu,
      /\b(?:lose|loss\s+of)\s+consciousness\b|\bpass\s+out\b/giu,
      /\b(?:dangerous|tight|forced)\s+restraint\b/giu,
    ],
    explanation:
      'The phrase references an activity where reduced attention or deliberate physical risk may be unsafe.',
    remediation:
      'Review the context and remove instructions that require impaired awareness or hazardous physical action.',
  },
  {
    id: 'intoxication',
    category: 'intoxication',
    description:
      'Encouragement to combine an immersive session with intoxication or impairment.',
    severity: 'required-review',
    searchPatterns: [
      /\b(?:combine|pair|use|start|run|listen)\b[^.!?\n]{0,60}\b(?:alcohol|recreational\s+drugs?|intoxicants?|intoxicated|drunk|high)\b/giu,
      /\b(?:alcohol|recreational\s+drugs?|intoxicants?|intoxicated|drunk|high)\b[^.!?\n]{0,60}\b(?:session|immersive|hypno)\b/giu,
    ],
    explanation:
      'This wording may encourage using the session while impaired by alcohol, recreational drugs, or another intoxicant.',
    remediation: 'Keep immersive use separate from intoxication or impairment.',
  },
  {
    id: 'self-harm',
    category: 'self-harm',
    description:
      'Language involving suicide, self-injury, or intentionally harmful bodily instructions.',
    severity: 'required-review',
    searchPatterns: [
      /\bsuicid(?:e|al)\b/giu,
      /\bself[-\s]?(?:harm|injur(?:y|e))\b/giu,
      /\b(?:intentionally|deliberately)\s+(?:hurt|harm|injure)\s+yourself\b/giu,
    ],
    explanation:
      'This content references self-harm, suicide, or deliberate bodily injury and requires direct review.',
    remediation:
      'Do not proceed with suggestion-heavy playback while this finding is unresolved.',
  },
] as const;

export const ruleById = new Map(reviewRules.map((rule) => [rule.id, rule]));
