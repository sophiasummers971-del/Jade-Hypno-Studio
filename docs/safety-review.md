# Safety and review engine

Milestone 3 adds a transparent, local pre-render review layer. Its job is **detect → highlight → explain → require review**. It is not a medical diagnostic system, therapist, moderation service, automatic censor, or guarantee of psychological safety.

## Local rule engine

Scanner version **1.0.0** is defined in `src/safety/reviewEngine.ts`. Inspectable rules live centrally in `src/safety/rules.ts`, not in UI components. The initial categories are loss of choice, persistent post-session commands, memory interference, reality confusion, dangerous physical activity, intoxication, and self-harm.

Each rule declares an ID, category, description, severity, regular-expression search patterns, explanation, and remediation guidance. The scanner reads block narration in memory and returns block ID, exact offsets, matched text, category, severity, and rule ID. It has no fetch/API path and does not transmit scripts.

Fantasy framing such as “imagine”, “picture”, “pretend”, or “within this fantasy” is not itself a reality-confusion rule. Pattern matching is intentionally limited and can still miss meaning or create false positives.

## Review workflow

The Session Editor has a **Review session** action. Scanning creates structural checks and content findings without changing narration. Findings show surrounding context and can be marked reviewed or dismissed with a required reason. Dismissed findings stay in the review record. If matched text is later edited away, the old record remains in audit history with an `edited` status.

Rescanning preserves reviewed/dismissed decisions only when the deterministic finding identity still matches the same rule, block, range, and text. A completed review is invalidated when session blocks change. A copied session starts with fresh review metadata rather than inheriting the source session’s completed review.

The UI says **REVIEW COMPLETE** only after all current findings and required structural checks are resolved. It never labels a session “safe”.

## Structural checks

The engine checks enabled blocks for Preflight, Opening / Arrival, Return, and Clean Exit. It also looks for a clear stop-reminder concept in an enabled Preflight or Arrival block. Return, Clean Exit, and the stop reminder are required-review structural checks. Missing lower-severity structure remains visible even when it does not block completion.

Milestone 2 does not persist the selected template ID. For that reason Milestone 3 runs structural checks for every session rather than guessing whether a saved session was originally created from an immersive template.

## Preflight and grounding path

The review screen establishes a non-diagnostic preflight interface for future immersive playback:

- I am awake and oriented.
- Reality feels ordinary and stable.
- I am choosing to run this session voluntarily.
- I understand that I can stop the session immediately.

Orientation and reality-stability use explicit “Yes” / “Not right now” choices so an unanswered box is not treated as a negative answer. If the user explicitly reports disorientation or that reality does not feel ordinary/stable, the interface does not recommend immersive playback and instead offers **Calm / Grounding Mode**.

Grounding Mode is deliberately plain. It shows ordinary date/time, a stopped-session message, neutral surroundings text, normal comfortable breathing, optional water, and a return to the ordinary application. It is not presented as treatment.

## RETURN NOW contract

`src/safety/returnNow.ts` owns the permanent application-level **RETURN NOW** action. Session data is never passed into the action and cannot disable or replace it.

Future playback code must register only implementation hooks and must invoke the shared `returnNow()` service for the exit action. Its shutdown sequence is:

1. stop narration
2. stop active media and reset HTML audio/video elements
3. stop visual effects
4. fade or stop audio
5. leave fullscreen when present
6. clear temporary session/player state
7. dispatch the application event that restores the ordinary interface

The current Milestone 3 app listens for that final event and returns to Home. This architecture is present now; actual narration, media, effects, and playback remain later milestones.

## Versioning and persistence

`SafetyReview` persists `reviewedAt`, `lastScannedAt`, `scannerVersion`, findings, structural checks, acknowledgement state, and unresolved count alongside the existing session document. Defaults allow older schema-version-1 sessions that contain only the earlier review status/notes fields to load without a complex migration.

The scanner version identifies which rule set produced a review. Milestone 3 intentionally does not implement ruleset migrations.

## Privacy and limits

All review operations are deterministic local TypeScript. No moderation API, AI service, telemetry, analytics, account, remote database, or script upload is added. Scanner output is advisory review metadata, not a medical or psychological safety guarantee. The engine does not understand every possible dangerous instruction and does not replace adult judgment.
