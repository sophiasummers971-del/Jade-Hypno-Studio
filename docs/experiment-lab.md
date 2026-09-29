# Personal Experiment Lab (Milestone 7)

The Personal Experiment Lab is an optional, local journal for observations made after completed sessions.

## Data and storage

Each observation stores a versioned record with the session UUID, title snapshot, session revision timestamp, completion time, observed duration, optional label and notes, and optional 1–5 ratings for absorption, relaxation, focus, immersion, distraction, comfort and enjoyment.

On the primary WebToApp/Android build, observations live in the `experiments` object store in the same `jade-hypno-studio` IndexedDB database used by the application. M7 upgrades that database from version 1 to version 2 by adding the new store. Existing session, settings and Trash stores are preserved.

Records retain their session ID and title snapshot when the original session is moved to Trash or otherwise absent, so history remains understandable without requiring the source session to exist.

## Workflow

After ordinary player completion, the user may choose **Record Session Notes** or simply **Exit player**. Recording is never required. RETURN NOW remains independent and never opens an experiment prompt.

The Experiment Lab can also be opened from main navigation. It supports create, edit, delete, history, filtering by active session and descriptive comparison of repeated runs.

## Comparisons

Summaries show count, arithmetic mean for each entered rating, and descriptive earlier-versus-recent means. Missing ratings are ignored. The app does not rank sessions or turn these values into recommendations.

## Privacy and safety

No observation is uploaded. M7 adds no accounts, telemetry, analytics, backend, remote database, localhost service or network request.

Ratings are user-entered observations only. They are not used to infer diagnosis, treatment effectiveness, susceptibility, mental-health status or medical outcomes. Lower absorption or immersion is not framed as failure, including when Grounding Mode has been used.

## Portable data

`src/experiment/portable.ts` provides a versioned JSON envelope for explicit experiment-record export/import. It is separate from single-session JSON so importing a session cannot silently overwrite or attach journal history. The portable format is validated before repository writes.

The current M7 interface focuses on record/history workflow; portable experiment JSON helpers are covered by tests and are ready for a later explicit file-picker/download surface without adding network access.
