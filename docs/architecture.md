# Milestone 2 architecture

**Primary: private Android APK through WebToApp. Storage: IndexedDB. Optional desktop: Tauri.**

## Findings before modification

At baseline `7b3e5b58dd21813eeb9b5053029ced845e20136f`:

- `src/storage/repository.ts` combined the repository contract with six Tauri `invoke` calls: list/load/save/trash session and load/save settings.
- `src/App.tsx` imported `isTauri` and `getCurrentWindow`, blocked ordinary-browser startup and registered native close callbacks directly.
- `src/App.close.test.tsx` mocked Tauri to test window destruction after saving.
- Autosave already depended on the repository interface, so its debounce/revision/write-ordering logic could be retained.
- Settings flowed through the same repository but relied on explicit save/navigation/normal close. That needed backgrounding support and ordered settings saves for mobile.
- Recoverable deletion lived in the Rust store as a rename to Trash. Safe writes, conflict checks, malformed-file preservation and directory assumptions were native-only.
- Vite used root-based assets; the original browser preview had no persistence. UUID creation called secure-context-only `randomUUID`.

## Small coherent refactor

`SessionRepository` holds `list`, `load`, `save`, and `trash`. `SettingsRepository` holds `loadSettings` and `saveSettings`. `Repository` composes them for the shell. Existing names were kept to avoid rewriting every view. Create is `save(session, null)`, updates use `save(session, expectedUpdatedAt)`, duplicate uses the existing domain copy helper and create, and rename is a validated update. Autosave now needs only `SessionRepository`.

`src/storage/adapters/indexeddb.ts` implements the primary adapter. The unchanged six invoke wrappers moved into `src/storage/adapters/tauri.ts`. UI code has no direct Tauri imports or command names. Platform lifecycle hooks have their own contract in `src/platform/contracts.ts`.

Vite selects `@platform` at build time: ordinary builds use `src/platform/web.ts`; optional `--mode tauri` uses `src/platform/tauri.ts`. There is no user-agent detection, runtime guessing or dynamic Tauri import in the default output. The native Rust store remains untouched. Build output directories are separated.

## IndexedDB transaction model

Database and stores are described in the README. Native IndexedDB is used; fake-indexeddb is test-only. Connection upgrades create the three version-1 object stores. Version-change closes the old connection; blocked upgrades return readable errors. There is no data migration or destructive upgrade code.

Operations resolve only at `IDBTransaction.oncomplete`. Request success is not treated as commit success. Validation exceptions abort the transaction. Browser request errors retain their default abort behavior. Quota errors surface an explicit unsaved-data warning.

The save transaction reads and validates the existing record before any update. A create checks both active and trash IDs and uses add, not put. An update compares `updatedAt`, keeps `createdAt` immutable and generates a strictly increasing UTC millisecond timestamp. Two connections racing with the same old timestamp cannot both win. List returns valid sessions and separate corrupt-record diagnostics; no record is rewritten during read.

Trash deletion performs add-to-trash and delete-from-sessions in one transaction. A trash collision or write error rolls the entire operation back. Restore performs add-to-active and delete-from-trash in one transaction; an active collision preserves both records. There is no ordinary permanent-delete path.

Settings are validated on read/write. Only an absent settings record uses defaults; a corrupt record is never silently replaced. The UI serializes/debounces settings writes and preserves edits made while an earlier save is in flight. Separate app windows still use last-committed-write-wins for settings; this is not a multi-user synchronization layer.

## Autosave and lifecycle

Existing session revision-based 600 ms autosave remains. Explicit Save, Save as copy, navigation flush, failure feedback, conflict recovery and the pending-write barrier on reopen are preserved. UUID generation uses cryptographic `getRandomValues` with v4 bits, so it does not require `randomUUID` availability. There is no insecure Math.random fallback.

The injected web lifecycle attempts a flush on `visibilitychange` to hidden and `pagehide`. `beforeunload` warns where the host supports it. These events cannot guarantee a final mobile save: Android process kill can happen without them. No async unload guarantee is claimed. Tauri's optional lifecycle retains its original close-and-save barrier separately from React views.

## JSON portability

`src/storage/portable.ts` validates serialization, limits input/output size, reads user-selected files with FileReader and requests downloads through local Blob URLs. Object URLs are revoked after the download handoff. No upload or arbitrary filesystem API exists.

Imports validate before invoking persistence and always assign new session identity/timestamps. Unknown versions and malformed data are rejected. Export serializes the current valid draft, enabling rescue even if local persistence fails. File-download completion is owned by the browser/WebView host and cannot be truthfully reported by the frontend. UI wording reflects that distinction.

Optional whole-library export was intentionally omitted from this focused refactor; session export does not contain application settings or Trash. There is no bulk import, migration or hidden overwrite logic.

## Static/offline packaging

`base: './'`, one IIFE bundle, a classic deferred script and extracted CSS support local file-protocol loading. There are no lazy runtime chunks or route-path rewrites. The default production HTML includes a CSP allowing local assets/blob media and forbidding network connections. Optional Tauri CSP stays in its own configuration.

`check:dist` checks every HTML/JS/CSS output for loopback, Tauri and desktop-path dependencies, checks relative referenced files exist, and checks the classic entry point. Official WebToApp documentation lists Frontend as file-protocol packaging with localhost optional. This build uses the no-server path. No service worker or hosted-site offline caching was added.

Three real Chromium tests open the exact production `file:` build with network disabled. They verify startup/style application, editing/autosave, JSON download/reimport, storage across an entire browser restart, capability probe persistence, local image decoding, WAV/WebM playback events and fullscreen entry. This validates the frontend runtime; it does not validate Android's exported shell.

## Capability spike

`public/capabilities.html`, `.js` and `.css` are a separate diagnostic, reachable from Settings after flushing. Its own `jade-capability-probe` database contains a timestamp only. It checks supported APIs and user-triggered local file operations. Media remains in memory, uses native HTML controls and is never stored in a session. No synthesizer, mixing/render engine, FFmpeg, TTS or milestone media architecture exists.

## Recovery and privacy

A developer can instantiate `IndexedDBRepository` for the same store and call `restore(id)` in a local development/debugging context. No global app object or unrestricted production bridge is exposed. Alternatively, in a trusted browser's IndexedDB inspector, read `trash[id].session` without editing it, copy its JSON into a local file, and use Import session JSON; this creates a new identity and leaves Trash unchanged. Android manual recovery may require developer assistance. Do not uninstall/clear storage before exporting recoverable data.

Data is scoped to the WebView origin/profile and is not encrypted. Quota/eviction, package identity, signing key and origin stability matter. JSON backups should be kept outside app storage. Imported text is rendered through React, never executed as code. There are no cloud/network APIs or session telemetry. Generated APK shell settings must be checked separately.

## Script Builder domain layer

`src/domain/scriptBuilder.ts` is platform-agnostic. It owns structural templates, block creation/copy/reorder/delete operations, word counting, estimated duration, active timeline calculation and local TXT/Markdown heading heuristics. It depends on the validated domain schema and cryptographic UUID helper, not on Tauri, IndexedDB, filesystem APIs or network services.

`src/components/ScriptBuilder.tsx` is the editor surface. The block list doubles as a planning timeline; drag-and-drop is optional and explicit Move Up/Move Down buttons remain available for touch and keyboard use. The center pane separates narration from private notes. The inspector stores voice, caption, visual, audio and transition configuration without invoking any rendering implementation.

## Milestone 2 schema compatibility

Schema version remains 1 because Milestone 2 extends the existing version with defaulted fields rather than changing persisted identity or storage semantics. Existing Milestone 1.1 records can be parsed with defaults for block voice volume, caption options, visual/audio configuration, manual duration override, session source imports and settings words-per-minute. Generated JSON schemas for the optional native adapter mirror those optional/defaulted properties, preserving older files.

Session blocks still enforce unique IDs at the session schema boundary. Numeric ranges constrain volume/opacity to 0–1, duration values to non-negative bounds, caption modes and transition types to known enums, and block types to the established type list. Invalid editor values cannot pass `SessionSchema.parse` into repository writes.

Private notes remain a distinct `notes` property. No helper in the script-builder layer derives narration/captions from notes, and serialization tests assert the two properties survive independently.

## Local script import

TXT/Markdown uses `<input type=file>` plus `FileReader`, with paste as an alternate path. The first state is an `ImportedTextDraft`; nothing is inserted into the session until explicit confirmation. Heading recognition is intentionally basic and reversible. The original local text plus filename/import timestamp is stored in `sourceImports`, while generated blocks remain ordinary editable blocks. React renders all imported material as text; no HTML execution, scraping or remote retrieval exists.

## Future boundary

Milestone 3+ remains outside this branch. There is no scanner, TTS, media synthesis, mixer, waveform editor, renderer, FFmpeg path, finished player, experiment engine, cloud service, AI generation or online library. Later work can consume the structured session model without changing the repository/platform boundary.

## Primary references

- IndexedDB transactions: <https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction>
- Transaction completion: <https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event>
- WebToApp Frontend: <https://shiaho777.github.io/web-to-app/guide/app-types/frontend>
- WebToApp app types (file protocol/optional localhost): <https://shiaho777.github.io/web-to-app/guide/app-types/>

## Milestone 3: local safety and review layer

The primary Android/WebToApp architecture remains unchanged: React + TypeScript + Vite uses the platform repository abstraction and IndexedDB for the production web build. Milestone 3 adds only local domain/UI modules above that boundary.

```
Session document
  ↓
pure rules + structural checks (src/safety)
  ↓
versioned SafetyReview metadata
  ↓
existing SessionRepository / IndexedDB
  ↓
Session Review UI
```

Rules are centralized in `src/safety/rules.ts`. `reviewEngine.ts` has no network dependency and never mutates block narration. Review metadata is part of the existing session document, so the IndexedDB adapter, JSON import/export, autosave ordering, and optional Tauri adapter continue to use the same repository contract.

`returnNow.ts` is a separate application-level exit service. It accepts no session-controlled action or configuration. Later player implementations may register shutdown hooks, but they must use this permanent service rather than implementing a script-controlled exit.

The Calm / Grounding screen is an ordinary React view with no media engine, flashing effects, generated content, or remote dependency. Milestone 3 deliberately adds no TTS, audio mixer, visual engine, FFmpeg, finished player, AI moderation, or cloud service.

## Milestone 5 visual engine

The visual preview is a browser/WebView-only presentation layer. `VisualEngine` subscribes to the Milestone 4 `AudioEngine` snapshot and never creates a competing playback clock. Block identity, pause/resume/stop, and elapsed preview state therefore come from audio. Visual timing remains approximate where Web Speech does not expose word-level timing; block boundaries are authoritative.

Local PNG/JPEG/WebP/GIF/MP4/WebM assets are selected with the browser file picker and stored only in a dedicated IndexedDB asset database. Sessions store an asset reference rather than embedding blobs, keeping session JSON portable and under its existing size limit. Object URLs are created lazily and revoked on replacement/disposal. `cleanupOrphans()` is available for deliberate garbage collection; it is not run automatically because deleting a session asset still referenced by another session would be destructive. The current asset limit is 128 MiB per imported visual. No media is uploaded.

GIF uses native image decoding and can be static on a limited WebView. MP4/WebM support depends on Android System WebView codecs. Decode errors leave the session/reference intact and fall back to the configured color/gradient. Video is muted, looped, inline, and never starts on editor load. Full preview requires an explicit tap. Fullscreen is optional and exits through the existing RETURN NOW path.

Effects are CSS-only: fade/crossfade presentation, slow zoom/pan, conservative opacity/brightness pulse, blur, fixation point, and a slow spiral. There is no WebGL, shader, strobe, rapid inversion, or flashing path. `prefers-reduced-motion` removes zoom, pan, pulse, and spiral animation while preserving static content. Touch controls have 44px minimum action height and do not require hover, right-click, drag, or keyboard input.

Captions are independent from narration generation. Full narration strips pause markers, selected phrases use explicit local settings, emphasis-only reads Markdown-style bold emphasis, and none disables output. Font size, alignment, vertical position, opacity, display duration metadata, and fade duration are stored per block. Caption changes follow the audio block boundary; word-level karaoke timing is intentionally out of scope.

RETURN NOW remains the Milestone 3 permanent action. Its hook registry is composable so M4 audio and M5 visuals can both register cleanup without replacing one another. It stops media/effects, clears caption/preview state, exits fullscreen where supported, and the existing application event restores the ordinary UI.
