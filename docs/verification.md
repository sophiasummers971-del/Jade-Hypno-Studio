# Milestone 1.1 verification

**MILESTONE 1.1 COMPLETE — READY FOR MILESTONE 2**

**APK packaging status: UNVERIFIED.** Completion here is the requested frontend/storage/static-packaging gate. It does not mean a signed Android APK has been built, installed or tested. The obsolete M1 desktop GTK/WebKit gate is no longer the primary completion criterion.

## Passing gates

- TypeScript, including repository adapters, UI, test code and browser test configuration.
- ESLint, Prettier, generated schema consistency.
- 60 Vitest tests across 7 files, including all 34 original test cases with the obsolete browser-preview assertion updated to working IndexedDB mode. Native-close tests explicitly inject the retained optional Tauri lifecycle.
- 3 real Chromium production tests: offline local-file application lifecycle/export/import/browser restart; persistence marker/JSON/image capabilities; audio/video/fullscreen capabilities.
- Production Vite build and output scan: six local files; relative assets, classic entry script, no Tauri/loopback/absolute desktop-path dependency.
- Existing Rust filesystem tests remain applicable to the untouched optional store; exact results appear in the delivery audit.

## What the tests prove

IndexedDB tests use fake-indexeddb for deterministic corruption, aborted-transaction, cross-connection conflict, Trash rollback/restore and settings checks. Real Chromium tests separately use actual IndexedDB and a persistent browser profile, close the entire browser, reopen it offline and verify sessions/settings. This avoids treating an in-memory mock as evidence of restart persistence.

Portable JSON tests validate exports, fresh-identity imports, malformed/oversized rejection and local Blob handoff. The browser test verifies a real downloaded JSON file can be imported again. Autosave tests cover newer edits during an in-flight write and failure recovery; settings have an additional in-flight-edit regression test. Web lifecycle tests verify flush/error handling and listener cleanup.

The isolated capability page uses ordinary media controls and user-selected Blob URLs. Browser tests use synthetic local test fixtures only. No session media engine was implemented.

## Not verified

WebToApp is absent; so are adb/Android SDK packaging tools and a connected phone. APK build, signing, installation, native file picker/download bridge, Android process death, storage-origin stability across APK updates, speaker output and target-device codecs remain UNVERIFIED. Follow `docs/webtoapp.md` to check them.

No public hosting, backend, Google service or account is required. Packaged offline startup was verified; a hosted browser site's offline cold start is outside scope because there is no service worker.

## Reproduction

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run format:check
npm run schema:check
npm run build
npm run check:dist
npx playwright install chromium --only-shell
npm run test:e2e
```

Optional existing native-store regression check (does not build Tauri's GUI):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
```

No GTK/WebKit installation, Tauri desktop proof, Milestone 2 implementation, merge, push or deployment belongs to this amendment.
