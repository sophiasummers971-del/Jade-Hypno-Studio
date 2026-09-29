# Milestone 6 player and renderer boundary

The M6 player is local-first and offline. `SessionPlayer` is the coordinator; M4 `AudioEngine` remains the authoritative playback clock and M5 visual/caption presentation follows its current-block state. M6 does not add an independent visual timer. Enabled blocks play in session order and disabled blocks are skipped by the existing M4 timeline.

Playback never autostarts. The Player view shows review status, unresolved findings and structural-check state before the user presses **Start Session**. Review language is deliberately non-certifying: a completed review is not a claim that a session is safe. Normal Stop returns to the player summary. RETURN NOW remains the M3 application-level action, requires no confirmation, stops registered audio/visual resources, exits fullscreen where possible and restores the ordinary interface.

Fullscreen is optional and gesture-driven. Missing Fullscreen, `matchMedia`, speech synthesis, AudioContext, object URL, codec, or media capabilities are treated as runtime capabilities rather than assumptions. Reduced-motion preference disables the player's decorative image motion while retaining captions and playback.

## Rendering/export boundary

Beta does not ship FFmpeg/WASM or promise MP4. No acceptable Android/WebView memory/startup evidence exists to justify that dependency. `PlayerExport` probes MediaRecorder WebM MIME support truthfully but does not claim that a capability probe alone is a reliable final renderer. The guaranteed portable export is a documented JSON session package containing package version, kind and the validated session document. Existing local visual assets remain in IndexedDB and are referenced by their local IDs; they are not silently uploaded or embedded.

There is no cloud renderer, remote backend, telemetry, localhost production dependency, or primary Tauri dependency. Codec support remains device/WebView-specific. APK/device-shell verification is a separate gate from static WebToApp compatibility.
