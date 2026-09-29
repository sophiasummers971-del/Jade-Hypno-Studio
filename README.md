# Jade Hypno Studio

**PRIMARY TARGET: Private Android APK packaged through WebToApp.**

**PRIMARY STORAGE: IndexedDB.**

**OPTIONAL SECONDARY TARGET: Tauri desktop.**

A private, single-user, local-first workspace for one adult to organise personalised audiovisual sessions. No medical/therapy service, accounts, backend or public hosting.

**Milestone 2 implementation branch:** structured script authoring is layered on the verified Milestone 1.1 IndexedDB/WebToApp foundation. APK packaging remains a separate on-device verification step and is not required when WebToApp is unavailable in the build environment.

## Run and build

Node.js 22.12+ and npm are sufficient for the primary web build. Rust is not required.

```sh
npm ci
npm run dev
npm run build
npm run check:dist
```

Development uses `127.0.0.1:1420`. Production does **not** require a server or localhost: package the entire generated `dist/` directory, including `index.html`, `assets/` and the capability-check files. Assets use relative URLs. Navigation stays inside React state, so there are no server-route rewrites or history-path requirements.

The primary build is a single classic deferred JavaScript bundle with a separate local stylesheet. This avoids ES module/CORS issues on file-protocol WebViews. It contains no Tauri runtime code. Do not package the source tree or `dist-tauri/` for Android.

For the phone steps, see **[docs/webtoapp.md](docs/webtoapp.md)**. The delivery includes a ready-built `dist/` and `webtoapp-dist.zip`; no on-phone Node installation is required when using those files.

## Script Builder

Milestone 2 keeps all six foundation views and adds structured session authoring inside Session Editor. New sessions can start from Blank Session, Relaxation, Immersive Fantasy or Adult Immersive Session structural templates. The default immersive structure contains Preflight, Arrival, Attention, Settling, Deepening, Main Fantasy, Intensification, Release, Return and Clean Exit. Templates contain structure rather than substantial canned narration, and every generated session receives independent block IDs.

Blocks can be added, renamed, enabled/disabled, duplicated, reordered, deleted and edited. Drag-and-drop is available on desktop, while explicit **Move Up** and **Move Down** controls remain the reliable touch/keyboard path on Android. A timeline displays order, title, estimated start/end, effective duration and enabled state. Disabled blocks stay visible but do not advance active runtime.

Narration duration is estimated from word count and the saved words-per-minute preference (150 WPM by default). A manual duration override can replace the estimate per block. These values are planning estimates, not frame-accurate render timings.

Each block stores voice, caption, visual, audio and transition configuration only. Milestone 2 does not synthesize or render any of those settings. **PRIVATE NOTES** are a separate editor-only field from **NARRATION** and are never automatically copied into narration or captions.

TXT and Markdown import uses the browser/WebView file selector or pasted text. Imported source is previewed locally before conversion. Basic heading heuristics can suggest blocks, the original source is retained inside the session for review, and the resulting blocks remain fully editable before saving. HTML is treated as text and is never executed.

The Milestone 1.1 autosave pipeline remains in place: it waits 600 ms, orders writes and never treats a failed write as saved. Save, Save as copy, JSON export and confirmed Reopen saved version remain available. Settings continue to debounce-save. Backgrounding attempts to flush pending work, but Android can terminate a process without a final event, so wait for **Saved locally** before closing.

## Local storage

The default build opens IndexedDB database `jade-hypno-studio`, database version 1:

| Object store | Key           | Value                               |
| ------------ | ------------- | ----------------------------------- |
| `sessions`   | Session UUID  | Validated schema-version-1 Session  |
| `settings`   | `preferences` | Validated schema-version-1 Settings |
| `trash`      | Session UUID  | `{ session, deletedAt }`            |

There is no localStorage persistence or temporary in-memory production fallback. If IndexedDB is unavailable, the UI reports an error. Active session edits, conflicting-revision checks and writes share a readwrite transaction. Delete copies the original into Trash and removes the active record in the **same transaction**. Success is reported only after transaction completion. Corrupt records are left untouched and shown separately from valid sessions.

Browser/WebView storage is scoped to its storage origin/profile. The installed APK must preserve its package identity, signing key and local content origin across updates. Builder preview and the installed APK can use different stores. Uninstall, clear-app-data, private/ephemeral mode, storage eviction or an origin change can remove or hide data. Keep exported backups outside app storage.

`IndexedDBRepository.restore(id)` is a tested recovery API that refuses to overwrite an active record; there is no Trash browser/restore UI yet. Developer-assisted recovery is described in `docs/architecture.md`. No purge action exists. Do not clear app data to solve a malformed-record error.

## Portable JSON backups

In the editor, choose **Export session JSON**. It validates and exports the current draft, even when a local save has failed. A Blob/download handoff is used; the UI says “download requested” because it cannot observe Android's final file write. Verify the file appears in Downloads or your chosen folder.

In Sessions, choose **Import session JSON** and select a local `.json` file. JSON and the full version-1 schema are validated before persistence. Imports always receive a **new UUID and new creation/update timestamps**; the title and content remain. Existing active or trashed sessions cannot be overwritten by an import. Invalid/oversized imports change nothing. Files are limited to 4 MiB.

This amendment supplies **per-session** portable backup/restore. The optional all-data backup was not added; settings and Trash are not included in a session export. Export each session you need to keep. Older desktop session JSON can be imported the same way, without direct filesystem access or automatic migration.

## Offline and privacy

The packaged app loads local assets. No accounts, Google authentication, Google Play Services API, cloud storage, database backend, CDN scripts, remote fonts, tracking, analytics, telemetry or remote configuration are used. Production CSP sets `connect-src 'none'`. The app has no network calls for session/settings/import/export operations.

Production was tested directly over `file:` with browser networking disabled, including an entire browser restart, session/settings persistence and JSON import/export. A browser tab originally served over HTTP is **not** promised to cold-launch offline: no service worker/site cache is implemented. Offline cold startup is supplied by the packaged local files, not public hosting.

Initial development dependency/browser-test downloads and installing a WebView/WebToApp builder can require internet. That does not add a runtime app dependency. WebToApp's generated Android shell, download bridge, permissions and any enabled extensions are outside this frontend and remain device-verification items. Keep optional online features disabled. JSON/IndexedDB is not encrypted; this does not defend against a compromised/unlocked device or another process with equivalent access.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run schema:check
npm run build
npm run check:dist
npx playwright install chromium --only-shell
npm run test:e2e
```

The locked Playwright version is 1.56.1: its available Chromium build ran successfully here after the initially resolved newer browser download failed. Playwright and fake-indexeddb are **development-only**. The adapter itself uses native IndexedDB without a runtime library. Schema generation still derives Rust JSON schemas from Zod; after a domain schema change run `npm run schema:generate` and commit the results.

See **[docs/verification.md](docs/verification.md)** for evidence and **[docs/webtoapp.md](docs/webtoapp.md)** for the device checklist. `Settings → Device capability check` opens a standalone local diagnostic for storage, file handoff, images, audio/video and fullscreen. It is not a media engine.

## Optional desktop

Tauri is retained to preserve valid work, but is excluded at build time from the default web bundle. `@platform` resolves to `web.ts` by default and `tauri.ts` only for `--mode tauri`.

```sh
npm run desktop:dev
npm run desktop:build
```

These optional commands require Rust and Tauri's host prerequisites. They use separate `dist-tauri/` output and the unchanged native JSON store. Typical desktop storage is the OS app-data directory under `local.jade.hypnostudio`, containing `sessions/`, `settings.json`, `Trash/` and `.studio.lock`. Desktop storage and IndexedDB are independent; JSON export/import is the portable bridge. There is no automatic sync.

Native storage tests can run without GUI dependencies:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
```

No GTK/WebKit installation or desktop build was attempted for this amendment. A prior native build remained unverified; that does not block M1.1's new primary target.

## Explicit limits

No safety scanner, automatic content blocking, TTS, speech synthesis, audio mixing, waveform editor, image/video rendering, FFmpeg integration, finished player, experiment tracking, AI script generation, online script library, cloud sync, authentication, scraping or remote APIs. Voice/audio/visual/caption/transition data are configuration only. SafetyReview and ExperimentMetadata remain structural fields. Media controls on the isolated diagnostic page are still capability tests, not the rendering engine.

Single-user beta limits remain: 200 blocks / 4 MiB per session, no pagination, no migration engine, no automatic backup/encryption and no Trash UI. Cross-window sessions use optimistic revision conflict checks; settings are last-committed-write-wins across separate windows. Filesystem power-loss durability and IndexedDB quota/eviction behavior remain OS/browser-dependent. Real Android keyboard, Back button, process death, permissions and exported APK behavior must be tested on-device.

The project remains private/local-first. Milestone 2 does not require a backend, localhost process, cloud service or Tauri native filesystem API in production.

## Milestone 6 Beta player

The local immersive player and renderer/export boundary are documented in [`docs/player-renderer.md`](docs/player-renderer.md). Playback remains offline-first for the Android/WebToApp path. Rendered video is capability-dependent; Beta does not promise MP4 or use cloud encoding.
