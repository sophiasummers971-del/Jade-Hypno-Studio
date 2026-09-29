import type { Session } from '../domain/schema';

export type RenderCapability = { supported: boolean; mimeType: string | null; reason: string };

const CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

type RenderCapabilityHost = {
  MediaRecorder?: Pick<typeof MediaRecorder, 'isTypeSupported'>;
};

type PackageDownloadHost = {
  Blob?: typeof Blob;
  URL?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  document: Pick<Document, 'createElement'>;
  setTimeout: typeof globalThis.setTimeout;
};

function defaultRenderCapabilityHost(): RenderCapabilityHost {
  return {
    MediaRecorder: globalThis.MediaRecorder,
  };
}

function defaultPackageDownloadHost(): PackageDownloadHost {
  return {
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    document,
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
}

export function renderCapability(
  host: RenderCapabilityHost = defaultRenderCapabilityHost(),
): RenderCapability {
  const Recorder = host.MediaRecorder;
  if (typeof Recorder?.isTypeSupported !== 'function') {
    return {
      supported: false,
      mimeType: null,
      reason: 'Rendered video export is unavailable in this WebView. Session JSON remains available.',
    };
  }

  const mimeType = CANDIDATES.find((type) => Recorder.isTypeSupported(type)) ?? null;
  return mimeType
    ? { supported: true, mimeType, reason: 'WebM recording is supported by this runtime.' }
    : {
        supported: false,
        mimeType: null,
        reason: 'This runtime does not report a supported WebM recording codec. Session JSON remains available.',
      };
}

export const sessionPackage = (session: Session) =>
  JSON.stringify({ packageVersion: 1, kind: 'jade-hypno-studio-session', session }, null, 2);

export function downloadSessionPackage(
  session: Session,
  host: PackageDownloadHost = defaultPackageDownloadHost(),
) {
  if (
    typeof host.Blob !== 'function' ||
    typeof host.URL?.createObjectURL !== 'function' ||
    typeof host.URL?.revokeObjectURL !== 'function'
  ) {
    throw new Error('Local file download is unavailable in this WebView.');
  }

  const blob = new host.Blob([sessionPackage(session)], { type: 'application/json' });
  const url = host.URL.createObjectURL(blob);
  const anchor = host.document.createElement('a');
  anchor.href = url;
  anchor.download = `${session.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'session'}.jade-session.json`;
  anchor.click();
  host.setTimeout(() => host.URL?.revokeObjectURL(url), 0);
}
