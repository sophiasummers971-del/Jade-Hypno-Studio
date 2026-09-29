import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SessionBlock } from '../domain/schema';
import { AudioEngine } from '../audio/AudioEngine';
import { AudioMixer } from '../audio/AudioMixer';
import { BrowserSpeechEngine } from '../audio/BrowserSpeechEngine';
import { BrowserAudioExporter } from '../audio/AudioExport';
import { estimateNarrationSeconds } from '../audio/AudioTimeline';
import { MediaResolver } from '../visual/MediaResolver';
import type {
  AudioEngineSnapshot,
  AudioTrackKind,
  SpeechVoice,
} from '../audio/types';

const initial: AudioEngineSnapshot = {
  state: 'idle',
  currentBlockId: null,
  elapsedSeconds: 0,
  error: null,
};
const accept =
  'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac';

export function AudioPanel({
  session,
  onChange,
}: {
  session: Session;
  onChange: (session: Session) => void;
}) {
  const [activeBlockId, setActiveBlockId] = useState(
    session.blocks[0]?.id ?? '',
  );
  const activeBlock =
    session.blocks.find((block) => block.id === activeBlockId) ??
    session.blocks[0] ??
    null;
  const resolver = useMemo(() => new MediaResolver(), []);
  const engine = useMemo(
    () => new AudioEngine(new BrowserSpeechEngine(), new AudioMixer(), resolver),
    [resolver],
  );
  const [playback, setPlayback] = useState(initial);
  const [voices, setVoices] = useState<SpeechVoice[]>([]);
  const [notice, setNotice] = useState('');
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const speechSupported = engine.speech.supported;
  const exporter = useMemo(() => new BrowserAudioExporter(), []);

  useEffect(() => engine.subscribe(setPlayback), [engine]);
  useEffect(() => () => {
    engine.dispose();
    resolver.dispose();
  }, [engine, resolver]);
  useEffect(() => {
    if (!speechSupported) return;
    void engine.speech
      .voices()
      .then(setVoices)
      .catch(() => setNotice('Voice discovery failed on this device.'));
  }, [engine, speechSupported]);

  const patchBlock = (change: Partial<SessionBlock>) => {
    if (!activeBlock) return;
    onChange({
      ...session,
      blocks: session.blocks.map((b) =>
        b.id === activeBlock.id ? { ...b, ...change } : b,
      ),
    });
  };
  const setVoice = (
    key: 'voiceId' | 'rate' | 'pitch' | 'volume',
    value: string | number,
  ) => {
    if (!activeBlock) return;
    patchBlock({
      voiceSettings: { ...activeBlock.voiceSettings, [key]: value },
    });
  };
  const setSessionLevel = (
    key: 'narrationLevel' | 'musicLevel' | 'ambientLevel' | 'effectsLevel',
    value: number,
  ) =>
    onChange({
      ...session,
      audioSettings: { ...session.audioSettings, [key]: value },
    });

  const importTrack = (kind: AudioTrackKind, file: File) => {
    if (
      !file.type.startsWith('audio/') &&
      !/\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name)
    ) {
      setNotice('That file does not look like a supported local audio format.');
      return;
    }
    engine.removeTrack(kind);
    engine.addTrack({
      id: kind + ':' + file.name,
      kind,
      name: file.name,
      mimeType: file.type,
      url: URL.createObjectURL(file),
    });
    setNotice(
      kind +
        ' loaded for this preview only. The audio blob is not uploaded or persisted.',
    );
  };

  const importNarration = async (file: File) => {
    if (!activeBlock) return;
    try {
      const asset = await resolver.importAudio(file);
      patchBlock({
        audioSettings: {
          ...activeBlock.audioSettings,
          narrationReference: asset.id,
        },
      });
      setNotice(`${asset.name} stored locally as narration for this block. Nothing was uploaded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Narration audio import failed.');
    }
  };

  const selectedVoiceMissing = Boolean(
    activeBlock?.voiceSettings.voiceId &&
    voices.length &&
    !voices.some((v) => v.id === activeBlock.voiceSettings.voiceId),
  );
  const requiredReview = session.safetyReview.findings.some(
    (f) =>
      f.present &&
      f.severity === 'required-review' &&
      f.status === 'unresolved',
  );

  return (
    <section className="audio-panel" aria-label="Audio engine">
      <div className="audio-heading">
        <div>
          <p className="eyebrow">AUDIO ENGINE / 04</p>
          <h2>Audio preview</h2>
        </div>
        <span className="badge">{playback.state}</span>
      </div>
      {!speechSupported && (
        <p className="notice">
          TTS unavailable in this WebView/browser. Local media can still be
          selected, but narration preview requires a device speech engine
          exposed through Web Speech API.
        </p>
      )}
      {selectedVoiceMissing && (
        <p className="notice">
          The previously selected voice is unavailable. Playback will use the
          device default voice until you choose another.
        </p>
      )}
      {notice && <p className="hint">{notice}</p>}
      {playback.error && (
        <p className="error" role="alert">
          {playback.error}
        </p>
      )}

      <div className="audio-grid">
        <section>
          <h3>Narration</h3>
          <input
            ref={(el) => { inputs.current.narration = el; }}
            className="sr-only"
            type="file"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importNarration(file);
            }}
          />
          <div className="media-row">
            <button disabled={!activeBlock} onClick={() => inputs.current.narration?.click()}>
              Choose local narration
            </button>
            <button
              disabled={!activeBlock?.audioSettings.narrationReference}
              onClick={() => activeBlock && patchBlock({
                audioSettings: { ...activeBlock.audioSettings, narrationReference: '' },
              })}
            >
              Use TTS instead
            </button>
          </div>
          <p className="hint">
            {activeBlock?.audioSettings.narrationReference
              ? 'Local narration audio replaces TTS for this block. Narration text remains available for captions.'
              : 'No local narration selected. This block uses device TTS.'}
          </p>
          <label>
            Preview block
            <select
              value={activeBlock?.id ?? ''}
              onChange={(e) => setActiveBlockId(e.target.value)}
            >
              {session.blocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.enabled ? '' : 'Disabled · '}
                  {block.title || block.type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Voice
            <select
              disabled={!activeBlock || !speechSupported}
              value={
                selectedVoiceMissing
                  ? ''
                  : (activeBlock?.voiceSettings.voiceId ?? '')
              }
              onChange={(e) => setVoice('voiceId', e.target.value)}
            >
              <option value="">Device default</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.lang}
                  {v.default ? ' · default' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rate: {activeBlock?.voiceSettings.rate ?? 1}
            <input
              type="range"
              min=".5"
              max="2"
              step=".05"
              disabled={!activeBlock}
              value={activeBlock?.voiceSettings.rate ?? 1}
              onChange={(e) => setVoice('rate', Number(e.target.value))}
            />
          </label>
          <label>
            Voice volume:{' '}
            {Math.round((activeBlock?.voiceSettings.volume ?? 1) * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              disabled={!activeBlock}
              value={activeBlock?.voiceSettings.volume ?? 1}
              onChange={(e) => setVoice('volume', Number(e.target.value))}
            />
          </label>
          <label>
            Pitch: {activeBlock?.voiceSettings.pitch ?? 0}
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              disabled={!activeBlock}
              value={activeBlock?.voiceSettings.pitch ?? 0}
              onChange={(e) => setVoice('pitch', Number(e.target.value))}
            />
          </label>
          <p className="hint">
            Use <code>[pause:3]</code> for a deliberate 3 second pause.
            Estimated narration including pauses:{' '}
            {Math.round(estimateNarrationSeconds(activeBlock?.narration ?? ''))}
            s.
          </p>
          <div className="audio-controls">
            <button
              className="primary"
              disabled={
                !activeBlock ||
                (!speechSupported && !activeBlock.audioSettings.narrationReference) ||
                playback.state === 'playing' ||
                playback.state === 'loading'
              }
              onClick={() => activeBlock && void engine.playBlock(activeBlock)}
            >
              Play block
            </button>
            <button
              disabled={playback.state !== 'playing'}
              onClick={() => engine.pause()}
            >
              Pause
            </button>
            <button
              disabled={playback.state !== 'paused'}
              onClick={() => void engine.resume()}
            >
              Resume
            </button>
            <button
              disabled={playback.state === 'idle'}
              onClick={() => engine.stop()}
            >
              Stop
            </button>
            <button
              disabled={!activeBlock || (!speechSupported && !activeBlock.audioSettings.narrationReference)}
              onClick={() =>
                activeBlock && void engine.restartBlock(activeBlock)
              }
            >
              Restart
            </button>
          </div>
        </section>

        <section>
          <h3>Mix</h3>
          {(
            [
              'narrationLevel',
              'musicLevel',
              'ambientLevel',
              'effectsLevel',
            ] as const
          ).map((key) => (
            <label key={key}>
              {key.replace('Level', '')}:{' '}
              {Math.round(session.audioSettings[key] * 100)}%
              <input
                type="range"
                min="0"
                max="1"
                step=".01"
                value={session.audioSettings[key]}
                onChange={(e) => setSessionLevel(key, Number(e.target.value))}
              />
            </label>
          ))}
          <p className="hint">
            Mixing is non-destructive. User media is never normalized or
            uploaded.
          </p>
          {(['music', 'ambient', 'effects'] as AudioTrackKind[]).map((kind) => (
            <div className="media-row" key={kind}>
              <input
                ref={(el) => {
                  inputs.current[kind] = el;
                }}
                className="sr-only"
                type="file"
                accept={accept}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) importTrack(kind, file);
                }}
              />
              <button onClick={() => inputs.current[kind]?.click()}>
                Choose {kind}
              </button>
              <button
                onClick={() => {
                  engine.removeTrack(kind);
                  setNotice(kind + ' removed from preview.');
                }}
              >
                Clear
              </button>
            </div>
          ))}
          <label>
            Fade in: {session.audioSettings.fadeInDuration}s
            <input
              type="range"
              min="0"
              max="10"
              step=".5"
              value={session.audioSettings.fadeInDuration}
              onChange={(e) =>
                onChange({
                  ...session,
                  audioSettings: {
                    ...session.audioSettings,
                    fadeInDuration: Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Fade out: {session.audioSettings.fadeOutDuration}s
            <input
              type="range"
              min="0"
              max="10"
              step=".5"
              value={session.audioSettings.fadeOutDuration}
              onChange={(e) =>
                onChange({
                  ...session,
                  audioSettings: {
                    ...session.audioSettings,
                    fadeOutDuration: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </section>
      </div>

      <section className="full-preview">
        <h3>Full-session audio preview</h3>
        {requiredReview && (
          <p className="notice">
            Required-review findings remain unresolved. This preview does not
            certify or censor the session; review them before immersive use.
          </p>
        )}
        <p>
          Current block:{' '}
          {session.blocks.find((b) => b.id === playback.currentBlockId)
            ?.title ?? 'none'}{' '}
          · elapsed {Math.round(playback.elapsedSeconds)}s
        </p>
        <div className="audio-controls">
          <button
            className="primary"
            disabled={
              (!speechSupported && !session.blocks.some((block) => block.audioSettings.narrationReference)) ||
              playback.state === 'playing' ||
              playback.state === 'loading'
            }
            onClick={() => void engine.playSession(session)}
          >
            Play session
          </button>
          <button
            disabled={playback.state !== 'playing'}
            onClick={() => engine.pause()}
          >
            Pause
          </button>
          <button
            disabled={playback.state !== 'paused'}
            onClick={() => void engine.resume()}
          >
            Resume
          </button>
          <button
            disabled={playback.state === 'idle'}
            onClick={() => engine.stop()}
          >
            Stop
          </button>
        </div>
        <p className="hint">
          Playback starts only after a tap. Foreground WebView playback is
          targeted; Android background playback is not guaranteed.
        </p>
      </section>
      <section>
        <h3>Audio export</h3>
        <p className="hint">{exporter.capability().reason}</p>
      </section>
    </section>
  );
}
