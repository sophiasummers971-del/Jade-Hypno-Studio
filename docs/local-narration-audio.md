# M7.1 Local Narration Audio

A session block may now set `audioSettings.narrationReference` to a local audio asset stored in the existing IndexedDB media store.

When the reference is empty, narration behavior is unchanged and `BrowserSpeechEngine` / `speechSynthesis` reads the block text.

When a reference exists, `AudioEngine` resolves that local asset and plays it through `AudioMixer` as the narration channel. It does not synthesize the block narration at the same time. Music, ambient and effects remain separate mixer channels.

The engine awaits the media element's actual end before advancing to the next block or completing the session. Pause, resume, normal Stop and permanent RETURN NOW operate through the same mixer lifecycle. Object URLs created while resolving narration are revoked after playback, failure or cancellation.

The narration text remains in the block and therefore remains available to the existing caption boundary. M7.1 does not attempt transcription or word-level synchronization.

Narration files are imported through a browser/WebView file picker and stored locally in IndexedDB. No upload, remote fetch, backend, localhost service or native filesystem dependency is introduced.
