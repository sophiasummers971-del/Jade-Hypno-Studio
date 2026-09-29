export type AudioExportCapability = { supported: false; reason: string };
export interface AudioExporter { capability(): AudioExportCapability; }
export class BrowserAudioExporter implements AudioExporter {
  capability(): AudioExportCapability {
    return { supported: false, reason: 'Offline narration export is unavailable because Web Speech API output cannot be routed reliably into an offline browser render. Playback remains fully local.' };
  }
}
