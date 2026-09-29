# Milestone 4 Audio Engine

Milestone 4 adds a local playback layer without changing the Android-first storage/platform boundary.

## Architecture

`src/audio` separates timeline parsing, the `SpeechEngine` contract, browser speech, Web Audio mixing, playback orchestration and the export boundary. React UI lives in `AudioPanel`. No domain code imports Tauri, IndexedDB or network services.

`BrowserSpeechEngine` treats Web Speech API support as a runtime capability. Voices are discovered dynamically and identified by voice URI/name. A missing stored voice falls back to the device default and is surfaced in the UI. Pitch is mapped from the session's semitone-style range to the Web Speech 0–2 range. Actual installed voices and synthesis quality belong to the Android system/WebView and are not guaranteed by this app.

## Pauses

Narration supports `[pause:3]` and decimal values such as `[pause:0.5]`. Valid pauses are parsed into timeline parts and never sent to TTS. Invalid directives are removed safely. Pause durations contribute to narration estimates.

## Local media and mixing

Music, ambient and effect files are selected with browser/WebView file inputs. MP3, WAV, OGG and M4A/AAC are offered, but codec decoding still depends on the host WebView. Selected files become in-memory Blob URLs for the current preview only. They are not uploaded and are not persisted to IndexedDB, avoiding large database blobs and stale Android file permissions.

Web Audio supplies non-destructive gain controls for narration, music, ambient and effects. Defaults remain narration 100%, music 20%, ambient 15%, effects 30% at the engine layer; persisted session defaults may differ for pre-existing settings. Fade in/out use gain ramps. No destructive normalization is performed.

## Playback lifecycle

Playback begins only from explicit user interaction. The engine reuses one AudioContext, resumes a suspended context on Play, prevents overlapping session previews, and disconnects media source/gain nodes on stop. Full-session preview walks enabled narrated blocks in order and shows the current block. Disabled blocks are skipped. Required-review findings produce a warning, not censorship or a safety claim.

Android may suspend or terminate a background WebView. M4 targets foreground playback only and adds no native foreground service.

## RETURN NOW

The audio engine registers shutdown hooks with the existing M3 `returnNow.ts` service. RETURN NOW cancels speech, stops HTML/Web Audio playback, clears active playback state and timers, then lets the existing application event restore the ordinary UI. Session data cannot replace or disable this contract.

## Export boundary

`AudioExport.ts` intentionally reports browser audio export as unavailable. Web Speech API does not expose synthesized PCM reliably for offline WAV rendering, so recording live playback would be misleading and fragile. No remote renderer, encoder, upload, FFmpeg coupling or paid API is introduced. A later local runtime can implement the same export boundary.

## Offline / WebToApp

Normal M4 code uses browser APIs only: SpeechSynthesis, Web Audio, HTMLAudioElement, File input and Blob URLs. There is no localhost, cloud storage, remote TTS, Google service or Tauri requirement in the primary path. Actual Android APK speech/codec behavior remains a device verification gate.
