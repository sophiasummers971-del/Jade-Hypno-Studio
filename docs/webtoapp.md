# Private Android packaging and device checks

**APK status: UNVERIFIED.** WebToApp, adb/Android SDK tooling and a connected Android device are not available in the coding environment. No APK build, signing, install or phone test is claimed.

These steps target the WebToApp Android builder documented at <https://shiaho777.github.io/web-to-app/>. A differently named builder may use different menus. The included prebuilt frontend needs no Node or Rust on the phone.

## Package the supplied build

1. Extract the delivery archive on your phone. Inside it, locate **`dist/index.html`**, its sibling `assets` folder and `capabilities.*` files. Keep them together. `webtoapp-dist.zip` contains the same six files with `index.html` at the ZIP root, if your builder accepts an archive rather than a directory.
2. In WebToApp, choose **Create → Frontend**. Select the supplied **build-output directory `dist`** (or extract `webtoapp-dist.zip` first). Use the prebuilt output, not the React source directory. If asked for an entry file choose `index.html`; if asked for a framework choose React/Vite.
3. Name it **Jade Hypno Studio**. Choose file/static operation. Leave any optional localhost server disabled; no Node/PHP/server runtime is needed. Keep JavaScript, DOM storage/IndexedDB and file selection available. Do not use a private/ephemeral storage profile. Keep the chosen local origin and isolation profile stable across updates.
4. Leave Google integration, remote translation, online extensions, notifications and other unused network features disabled. No login, Google account, Play Services or public URL is needed by the frontend.
5. Save the app definition. Preview it, but treat preview as a preliminary check: preview storage can differ from the exported APK.
6. On its app card choose **⋮ → Build APK**. Select **System WebView** for the first test. Build/sign locally using the builder's signing flow. Keep the same package identifier and signing key for later updates, and back up the key securely. Do not publish it. A builder engine/component download, if required during setup, is distinct from app runtime.
7. Install the generated APK through Android's package installer. If Android asks, permit installation from the particular local source you used. This is a private sideload, not a Play Store submission.
8. Run the checklist below in the **installed APK**. Only mark APK status VERIFIED after completing it. Do not infer success from the builder preview.

## Installed APK checklist

Use disposable test sessions first. Do not clear existing personal data for testing.

| Check               | Exact action                                                                                                                  | Pass condition                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Offline cold launch | Enable airplane mode, turn Wi-Fi off, close and relaunch the installed app                                                    | Home opens normally without a server, sign-in or network request requirement |
| Storage             | Create “Android check”; edit title/description/mode; wait for Saved locally                                                   | Saved state appears and edits reopen                                         |
| Autosave order      | Type several rapid edits, immediately navigate to Sessions, then reopen                                                       | Latest text is present, not an earlier revision                              |
| App restart         | Wait for Saved locally, close/reopen normally; then repeat after force-stop                                                   | Committed session remains; unsaved draft survival is not promised            |
| Settings            | Change duration, voice placeholder, resolution, caption default, directory placeholder and all three levels; save and restart | Every saved preference survives; a new session uses them                     |
| List actions        | Duplicate, rename, cancel Delete, then confirm Delete                                                                         | New ID/copy, renamed title and recoverable removal behave correctly          |
| JSON export         | Open a session; Export session JSON; inspect the device's Downloads/file destination                                          | A real JSON file exists, opens and contains the expected text                |
| JSON import         | Sessions → Import session JSON; choose that local file                                                                        | New session appears with the same content and a different ID                 |
| Bad JSON            | Try importing a small malformed JSON file                                                                                     | Clear error; existing sessions remain unchanged                              |
| Update persistence  | Back up test sessions, install a later signed update with the same identity                                                   | Existing data remains visible; no new ephemeral origin/store                 |
| Native UX           | Open keyboard, rotate, use Android Back, background/resume                                                                    | Controls remain usable; no navigation unexpectedly discards committed work   |

If export only shows “download requested” but no file appears, the host download bridge is not yet verified. WebToApp documents Blob download interception under **Edit Common Config → Special Settings**; inspect that option in your installed version and repeat the small JSON export/import round-trip. Threshold/scope behavior is version-dependent—do not declare success just because the toggle is enabled. Do not enable a cloud download service.

If IndexedDB is denied or disappears across reopen, check storage settings and the stable file/origin mode. Do not switch to a localhost server to hide the issue: that would fail this task's production requirement. Record the WebToApp/WebView versions and failing step.

## Capability check page

Open **Settings → Device capability check** in the APK:

1. Write a timestamp marker, reload the page, close/reopen the app and return; the same marker should remain.
2. Download test JSON, verify the actual device file, then select it with the JSON picker.
3. Select a local image and confirm it decodes.
4. Select local audio and press Play; confirm the playing status **and actual audible output**. Headless tests cannot verify your phone speaker.
5. Select local video and press Play; confirm movement, sound if present, and normal controls. Codecs depend on the WebView/device.
6. Test fullscreen and exit it. Android may require a user gesture or impose orientation restrictions.
7. Optional: request persistent storage. Denial does not mean IndexedDB is broken; keep external backups regardless.

The capability page does not add any selected media to sessions. Fullscreen or codec support on a desktop browser is not evidence of support in Android's WebView.

## Evidence currently available

| Capability                                               | Production desktop Chromium, offline `file:` build | Installed APK |
| -------------------------------------------------------- | -------------------------------------------------- | ------------- |
| IndexedDB and persistence after full browser restart     | VERIFIED                                           | UNVERIFIED    |
| Session JSON download and file import                    | VERIFIED                                           | UNVERIFIED    |
| Image picker API and image decode                        | VERIFIED via local test input                      | UNVERIFIED    |
| Audio picker API and WAV playback event                  | VERIFIED                                           | UNVERIFIED    |
| Video picker API and WebM playback event                 | VERIFIED                                           | UNVERIFIED    |
| Fullscreen API entry                                     | VERIFIED                                           | UNVERIFIED    |
| Android system picker/download bridge and permissions    | Not applicable                                     | UNVERIFIED    |
| Signing, installing, updating, Android process lifecycle | Not applicable                                     | UNVERIFIED    |

Official references consulted: [Frontend](https://shiaho777.github.io/web-to-app/guide/app-types/frontend), [App types](https://shiaho777.github.io/web-to-app/guide/app-types/), [Build APK](https://shiaho777.github.io/web-to-app/guide/app-actions/build-apk), [Special Settings](https://shiaho777.github.io/web-to-app/guide/app-actions/edit-common-config/special-settings).
