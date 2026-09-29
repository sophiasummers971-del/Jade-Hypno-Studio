# Milestone 1 verification gate

**MILESTONE 1 INCOMPLETE** until a native Tauri build and real desktop smoke test pass. The source implementation and automated frontend/core-storage checks exist; a browser bundle alone does not satisfy the desktop launch requirement.

## Environment blocker

The implementation container initially lacked Rust. Rust/Cargo 1.98.1 was successfully installed for testing. Installing Linux prerequisites using `apt-get` failed with OS permission errors (`setgroups`, `setegid`, `seteuid`). The full `npm run desktop:build` subsequently reached the Rust desktop dependency build and failed because `pkg-config`/GTK/WebKit prerequisites are unavailable. No permissions were escalated and Electron was not substituted.

A Vite dev server started on `http://127.0.0.1:1420/`. This is not proof that Tauri launches. A browser screenshot attempt was unavailable because no Playwright Chromium executable is installed. Component tests use jsdom, and the native store tests use the real filesystem.

## Required remaining checks on a supported desktop

1. Install the documented Tauri prerequisites and run `npm ci` and `npm run desktop:dev`.
2. Confirm all six views and IPC permissions work in the actual Tauri window, with the internet disconnected after dependencies are installed.
3. Create a blank session; edit title, description and mode quickly; verify the unsaved/saving/saved indicator and final JSON. Navigate away immediately after editing and reopen it.
4. Use Save as copy; verify the original and new UUID are distinct. Rename and duplicate from Sessions.
5. Cancel deletion, then confirm deletion. Verify the exact original JSON remains in Trash.
6. Change every settings field, close normally, relaunch and verify persistence and new-session defaults. Close immediately after an edit to exercise the actual window-close save barrier.
7. With the app closed, back up and corrupt a test session JSON. Relaunch: it must be listed as an issue without losing valid sessions or changing the corrupt bytes. Repeat with settings JSON and restore the backup after the check.
8. Exercise a save failure with disposable test data (for example unavailable writable space). Verify the app does not claim success, keeps edits, supports Save as copy if storage is available, and blocks normal close/navigation while unsaved. Do not damage personal data to run this check.
9. Run `npm run desktop:build`. Install and launch the produced package; repeat the create/save/restart smoke check. Check target-platform security and webview prerequisites.

Only then change the milestone status to COMPLETE. Do not start Milestone 2 as a substitute for completing this gate.
