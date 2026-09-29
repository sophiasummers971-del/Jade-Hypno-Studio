# Jade Hypno Studio

Private, single-user, local-first desktop workspace for one adult to organise personalised audiovisual sessions. Not a medical application, therapy service, public platform or remote-control tool.

**Current scope: Milestone 1 — Foundation only.** React + TypeScript + Vite + Tauri 2. The foundation code and automated checks are implemented. Native desktop launch/build acceptance is **not yet verified**: the implementation environment lacks Linux GTK/WebKit/pkg-config prerequisites. Do not treat the browser build as a verified desktop beta. See `docs/verification.md` for the remaining gate.

## Requirements

- Node.js 22.12+ and npm; the lockfile pins the dependency tree.
- Rust stable with Cargo. This build was tested with Rust 1.98.1; dependency minimum versions may exceed the package's own language minimum.
- Tauri platform prerequisites: <https://v2.tauri.app/start/prerequisites/>.
- Linux: C/C++ build tools, pkg-config, GTK 3, WebKitGTK 4.1 development libraries, the Tauri packaging prerequisites and a desktop display.
- Windows: Microsoft C++ build tools and WebView2. macOS: Xcode command-line tools. These platforms have not been tested here.

## Run locally

```sh
npm ci
npm run desktop:dev
```

This starts the Vite development server on `127.0.0.1:1420` and the Tauri window. Production does not run an HTTP server. Development/build installation requires access to npm, crates.io and platform dependency providers; there is no session-data upload.

```sh
npm run dev
```

This second command is **UI preview only**. A browser cannot access the session store. It displays a warning and disables creation; there is no localStorage, IndexedDB or remote fallback.

## Verify and build

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run schema:check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --no-default-features --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
npm run build
npm run desktop:build
```

`npm run build` produces only the frontend in `dist/`. `desktop:build` compiles and packages the desktop application for the host platform under `src-tauri/target/release/bundle/`. Unsigned packages may trigger OS warnings; signing and distribution are outside this milestone. Platform bundling and installation remain unverified.

After changing domain schemas, run `npm run schema:generate` and commit the generated schemas. Schema version 1 is accepted; other versions are rejected without rewriting. There is no migration engine.

## What works in the foundation

- Home, Sessions, New Session, Session Editor, Settings, About / Safety.
- Create, validate, save, reopen, duplicate, rename and confirmed move to Trash.
- Title/description/mode editing, metadata and read-only block placeholders.
- 600 ms debounced autosave, serialized writes, visible failure state, explicit Save and Save as copy.
- Navigation and normal window closure wait for saves. If saving fails the current view/window remains open.
- Save as copy keeps you on the original. For conflicts, save a copy, then use **Reopen saved version** and confirm discarding the original draft.
- Settings save explicitly and when leaving the view or normally closing. New sessions use their defaults.

## Where files live

Native code uses Tauri `app.path().app_data_dir()` with identifier `local.jade.hypnostudio`. The frontend never chooses the storage root.

Typical locations (environment overrides and OS configuration can change the prefix):

| Platform | Application data folder                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| Linux    | `$XDG_DATA_HOME/local.jade.hypnostudio`, usually `~/.local/share/local.jade.hypnostudio` |
| Windows  | `%APPDATA%\local.jade.hypnostudio`                                                       |
| macOS    | `~/Library/Application Support/local.jade.hypnostudio`                                   |

Within that folder:

- `sessions/<canonical-uuid>.json` — versioned session files.
- `settings.json` — saved preferences (built-in defaults are used until the first settings write).
- `Trash/<session-uuid>-<unique-uuid>.json` — deleted session originals, retained indefinitely.
- `.studio.lock` — advisory lock; a second studio instance cannot access the same store.

Data is never intentionally written into the repository. Git ignores common data paths as an extra safeguard. Files are plain JSON, **not encrypted**. Back up this folder yourself with the app closed.

To restore a trashed session, close the app, inspect the JSON `id`, and copy it to `sessions/<id>.json` only if that name does not already exist. Never overwrite an existing session during recovery. Malformed files are retained unchanged; make a backup before manual repair. Restore well-formed version-1 JSON, then reopen the app. Corrupt settings are not silently reset.

## Privacy and security

No accounts, backend, analytics, telemetry, advertising, tracking, remote logs, model APIs, automatic updates or session network transmission. App assets and fonts are bundled/local. Startup and session editing need no internet after the app and OS webview are installed. A Windows WebView2 installer/bootstrapper can require internet during installation if the webview is absent; that is a platform prerequisite, not session transmission.

Six bounded IPC operations accept session UUIDs or validated documents, not arbitrary filesystem paths. The export-directory setting is inert text; it grants no filesystem authority. Rust validates inputs and files independently of the frontend. Capabilities are limited to the local main window, those commands, close destruction and event handling. The production CSP excludes remote content/connections apart from Tauri's local IPC transport. No shell plugin, unrestricted filesystem plugin or unsafe HTML injection is included.

This does not protect data from an attacker already controlling your OS account. Use full-disk encryption/access controls if needed. Atomic writes protect the previously saved JSON from partial writes; force-quit, power loss and filesystem failures can still lose edits that have not reached disk. Directory syncing adds durability on Unix, but no power-loss guarantee is claimed across every filesystem/OS.

## Limits and later milestones

No full block editor, safety scanner, TTS, playback, audio/music mixing, captions engine, video/FFmpeg rendering, AI generation, experiment tracking, accounts, sync, sharing or payments. `SafetyReview` and `ExperimentMetadata` are data placeholders only. Initial modes are `standard` and `custom`, neutral structural labels.

Sessions are limited to 4 MiB on disk and 200 blocks. The small personal library is loaded in memory; pagination/indexing, trash UI, encryption, migration, automated backups and external-editor file watching are not implemented. Concurrent internal edits are serialized and a second app instance is locked out. Timestamp-based conflict checks do not detect an external manual edit that deliberately retains the same `updatedAt` value.

Development dependency installation emitted an ESLint 9 end-of-support warning and a transitive `whatwg-encoding` deprecation warning. Both are development-only; they are documented rather than hidden. No exhaustive third-party vulnerability audit or native platform certification has been performed.

## Delivery archive

The source archive includes a `jade-hypno-studio.bundle` containing the isolated Git branch. To restore its history in a separate directory:

```sh
git clone jade-hypno-studio.bundle jade-hypno-studio-restored
cd jade-hypno-studio-restored
git switch codex/milestone-1-foundation
```

No merge, deployment or push was performed. Stop at this milestone.
