# Milestone 2 verification

Milestone 2 is verified against the exact Milestone 1.1 baseline commit `3792d81630c5ea213127dda37e46caca6f426e3b` on isolated branch `codex/milestone-2-script-builder`. The primary target remains the production Vite `dist/` packaged by WebToApp with IndexedDB persistence. Tauri is optional and must not be required for the production web build.

## Required gates

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run format:check
npm run schema:check
npm run build
npm run check:dist
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
git diff --check
```

The Milestone 2 tests cover default and blank templates, block creation/duplication/deletion/reordering, disabled timeline behavior, narration duration/manual overrides, notes/narration serialization separation, review-before-import behavior with source preservation, template independence, schema rejection of invalid values, touch-friendly move controls and populated-block deletion confirmation. Existing Milestone 1.1 tests remain regression coverage for IndexedDB, ordered autosave, settings persistence, JSON backup/import, lifecycle behavior and offline production output.

## Android/WebToApp verification boundary

Frontend compatibility is checked through the normal Vite build, `check:dist`, file-protocol browser tests and absence of Tauri/localhost/runtime-network dependencies. APK packaging, Android system picker behavior, WebView keyboard/back behavior, process death, signing/update identity and real-device storage retention require an actual WebToApp/device environment. If that environment is unavailable, those items are reported **UNVERIFIED**, not treated as a source-code failure.

## Milestone boundary

Verification must also inspect the final Git diff for accidental Milestone 3+ work and private user content. No merge or deployment belongs to Milestone 2 completion.
