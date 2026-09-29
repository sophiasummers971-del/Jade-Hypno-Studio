# Foundation architecture

## Frontend

`src/App.tsx` owns the six-view shell, current session, preferences, visible operation feedback and action confirmation. Navigation is explicit and local; no remote routing service exists. `src/components` contains error and keyboard-contained modal boundaries. Native file access is not available to view components directly: they use a typed `Repository` interface.

`src/domain/schema.ts` is the authoritative TypeScript model and Zod runtime validation. All required Session and SessionBlock fields and supporting settings types exist. Durations are seconds except the settings form's default duration in minutes. Levels are normalized 0–1. Timestamps are UTC ISO strings. UUIDs are canonical lowercase. Strings, block counts and numerical ranges are bounded; objects are strict to avoid silently stripping future fields.

`src/storage/repository.ts` implements the production repository using Tauri `invoke`. Responses are validated too. Test-only memory persistence lives under `src/test`; production has no browser persistence fallback.

## Validation and schema evolution

`scripts/generate-schema.ts` derives Draft-7 JSON schemas and default settings from Zod for the Rust store. They are checked in under `src-tauri/schemas`. `schema:check` checks drift. Rust adds equivalent cross-field checks for chronological timestamps and unique block IDs, which JSON Schema cannot express here. It also checks that the session ID matches the filename.

Both session and settings documents require `schemaVersion: 1`. Unsupported versions, malformed JSON, invalid fields and oversized files return errors. They are never silently migrated or overwritten. A future explicit migration layer belongs outside this milestone.

## Native boundary

`src-tauri/src/main.rs` registers exactly six commands:

| Command         | Input                                            | Output                                  |
| --------------- | ------------------------------------------------ | --------------------------------------- |
| `list_sessions` | none                                             | Valid sessions and per-file diagnostics |
| `load_session`  | UUID                                             | Validated session                       |
| `save_session`  | Session + expected timestamp, or null for create | Saved session with native timestamp     |
| `trash_session` | UUID + expected timestamp                        | Success or error                        |
| `load_settings` | none                                             | Validated settings or built-in defaults |
| `save_settings` | Settings                                         | Validated saved settings                |

Native code alone resolves `app_data_dir`. No IPC path, arbitrary command execution, shell, HTTP or broad filesystem plugin exists. `capabilities/main.json` permits only those commands and minimal event/window close operations for the local main window. `build.rs` declares application commands so generated permissions can restrict them. Production CSP blocks remote sources and remote fetches.

An application state mutex serializes all commands. An OS advisory file lock excludes a second application instance. Store initialization errors are retained and returned to the UI by commands instead of silently switching stores. The Tauri webview itself remains a required platform dependency.

## Storage and durability

`src-tauri/src/lib.rs` is independently testable without the desktop GUI feature. It uses bounded reads, JSON Schema validation, UUID-derived paths, symlink rejection for managed paths, and Unix 0700 data directories. Temporary files use restricted creation permissions (0600 on Unix). This is not a sandbox against a hostile process running as the same OS user; path checks and locks assume a trusted single-user environment.

Creates use exclusive persistence so they cannot overwrite an existing ID. Updates first validate the existing document and compare `updatedAt`; `createdAt` remains immutable. Native `updatedAt` increases monotonically for that session. Atomic replacement uses a same-directory temporary file, writes and `sync_all`, then `tempfile::persist`. Unix directory sync confirms rename durability. A failure after replacement but before directory sync is explicitly reported as uncertain durability; reopen/copy is required rather than assuming the old version is still on disk.

Deletion is a rename into Trash with a unique suffix, followed by Unix directory syncing. The app never purges Trash. Malformed files appear as separate list diagnostics and remain available for manual recovery.

Settings use the same validation and atomic-write path. A corrupt existing settings file is not overwritten by defaults. No filesystem operation uses the export-directory preference.

## Autosave and operation ordering

`Autosave` tracks edit revision and acknowledged revision. It debounces for 600 ms, permits one in-flight write, and drains newer edits after that write. A completion acknowledges only the revision actually persisted. It updates the optimistic timestamp from the native response. Errors keep the draft dirty and surface a retry message; there is no infinite retry loop.

Explicit Save flushes the queue. Navigation and native normal-close handling wait for both session and settings writes; a failure blocks the action. Force-kill cannot be intercepted. Reopen discards only after confirmation, cancels scheduled autosave, waits for an already-running atomic write to settle, then reads disk. Save as copy uses a new UUID and leaves the original draft untouched. All UI-triggered operations use a shared busy guard to prevent duplicate submits and conflicting transitions.

## Errors and diagnostics

UI notices contain a friendly summary and expandable technical details. No primary-UI stack traces and no remote logging. Native validation errors report field paths, not the personal contents of a rejected field. Read errors identify malformed line/column without copying the file. A React error boundary catches render failures. Async application operations are caught at the caller. Full native launch/close behavior still needs verification on a supported desktop.

## Test boundary

Frontend tests verify schemas, autosave races/retries, creation, list actions, settings remount, conflict recovery, corruption notices, and simulated native-close callbacks. Rust tests use actual temporary directories for storage and restart behavior, locks, corruption preservation, conflict rejection, Trash bytes, path/symlink rejection and injected interruption before atomic replacement. Mocked native-close tests are not substitutes for a launched Tauri window.

## Future boundaries

Milestone 2 may introduce block editing using the existing block schema. Rendering, voices, audio, captions, playback, scanning and experimentation require later explicit work. No placeholder executes, synthesizes or transmits content.

## Primary references consulted

- Tauri capabilities: <https://v2.tauri.app/security/capabilities/>
- Tauri configuration: <https://v2.tauri.app/reference/config/>
- Atomic persistence API: <https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html#method.persist>
- JSON Schema runtime used: <https://docs.rs/crate/jsonschema/0.18.3>
