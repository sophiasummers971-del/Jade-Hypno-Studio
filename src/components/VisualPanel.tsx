import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { AudioMixer } from '../audio/AudioMixer';
import { BrowserSpeechEngine } from '../audio/BrowserSpeechEngine';
import type { Session, SessionBlock } from '../domain/schema';
import { returnNow } from '../safety/returnNow';
import { effectClass, effectStyle } from '../visual/effects';
import { MediaResolver } from '../visual/MediaResolver';
import { transitionStyle } from '../visual/TransitionEngine';
import { VisualEngine } from '../visual/VisualEngine';
import type { ResolvedMedia, VisualSnapshot } from '../visual/types';

const initial: VisualSnapshot = {
  state: 'idle',
  currentBlockId: null,
  elapsedSeconds: 0,
  caption: '',
  transition: 'none',
  error: null,
};
const mediaAccept =
  'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm';

export function VisualPanel({
  session,
  onChange,
}: {
  session: Session;
  onChange: (session: Session) => void;
}) {
  const resolver = useMemo(() => new MediaResolver(), []);
  const audio = useMemo(
    () => new AudioEngine(new BrowserSpeechEngine(), new AudioMixer(), resolver),
    [resolver],
  );
  const engine = useMemo(() => new VisualEngine(audio), [audio]);
  const [snapshot, setSnapshot] = useState(initial);
  const [media, setMedia] = useState<ResolvedMedia | null>(null);
  const [notice, setNotice] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const current =
    session.blocks.find((b) => b.id === snapshot.currentBlockId) ??
    session.blocks.find((b) => b.enabled) ??
    null;

  useEffect(() => {
    const unsubscribe = engine.subscribe(setSnapshot);
    return () => {
      unsubscribe();
    };
  }, [engine]);
  useEffect(
    () => () => {
      engine.dispose();
      audio.dispose();
      resolver.dispose();
    },
    [engine, audio, resolver],
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setReducedMotion(false);
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => {
      query.removeEventListener?.('change', sync);
    };
  }, []);
  useEffect(() => {
    engine.attachVideo(video.current);
  }, [engine, media, current?.id]);
  useEffect(() => {
    let cancelled = false;
    const reference = current?.visualSettings.mediaReference ?? '';
    void resolver
      .resolve(reference)
      .then((resolved) => {
        if (!cancelled) setMedia(resolved);
      })
      .catch((error) => {
        if (!cancelled) {
          setMedia(null);
          setNotice(
            error instanceof Error
              ? error.message
              : 'Local visual media could not be decoded.',
          );
        }
      });
    return () => {
      cancelled = true;
      if (reference) resolver.revoke(reference);
    };
  }, [current?.id, current?.visualSettings.mediaReference, resolver]);

  const patchVisual = (change: Partial<SessionBlock['visualSettings']>) => {
    if (!current) return;
    onChange({
      ...session,
      blocks: session.blocks.map((b) =>
        b.id === current.id
          ? { ...b, visualSettings: { ...b.visualSettings, ...change } }
          : b,
      ),
    });
  };
  const importMedia = async (file: File) => {
    if (!current) return;
    try {
      const asset = await resolver.import(file);
      patchVisual({ mediaReference: asset.id, backgroundType: asset.kind });
      setNotice(
        `${asset.name} stored locally for this device. Nothing was uploaded.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Visual media import failed.',
      );
    }
  };
  const visual = current ? current.visualSettings : null;
  const background =
    visual?.backgroundType === 'gradient'
      ? visual.gradient
      : (visual?.backgroundColor ?? '#101319');
  const mediaStyle: CSSProperties | undefined = visual
    ? {
        ...effectStyle(visual, reducedMotion),
        objectFit: visual.fit === 'center' ? 'none' : visual.fit,
      }
    : undefined;

  return (
    <section className="visual-panel" aria-label="Visual engine">
      <div className="visual-heading">
        <div>
          <p className="eyebrow">VISUAL ENGINE / 05</p>
          <h2>Audio-synchronized visual preview</h2>
        </div>
        <span className="badge">{snapshot.state}</span>
      </div>
      <p className="hint">
        Preview starts only after a tap. Local media stays in IndexedDB on this
        device. Reduced-motion preference suppresses zoom, pan, pulse and spiral
        movement.
      </p>
      {notice && <p className="notice">{notice}</p>}
      {snapshot.error && (
        <p className="error" role="alert">
          {snapshot.error}
        </p>
      )}
      <div className="visual-layout">
        <section className="visual-controls">
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept={mediaAccept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importMedia(file);
            }}
          />
          <button
            type="button"
            disabled={!current}
            onClick={() => input.current?.click()}
          >
            Choose local image / video
          </button>
          <button
            type="button"
            disabled={!current?.visualSettings.mediaReference}
            onClick={() =>
              patchVisual({ mediaReference: '', backgroundType: 'color' })
            }
          >
            Clear media
          </button>
          <label>
            Background
            <select
              disabled={!current}
              value={visual?.backgroundType ?? 'color'}
              onChange={(e) =>
                patchVisual({
                  backgroundType: e.target
                    .value as SessionBlock['visualSettings']['backgroundType'],
                })
              }
            >
              <option>none</option>
              <option>color</option>
              <option>gradient</option>
              <option>image</option>
              <option>video</option>
              <option>gif</option>
            </select>
          </label>
          <label>
            Opacity {Math.round((visual?.opacity ?? 1) * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={visual?.opacity ?? 1}
              onChange={(e) => patchVisual({ opacity: Number(e.target.value) })}
            />
          </label>
          <label>
            Blur {visual?.blur ?? 0}px
            <input
              type="range"
              min="0"
              max="30"
              value={visual?.blur ?? 0}
              onChange={(e) => patchVisual({ blur: Number(e.target.value) })}
            />
          </label>
          <label>
            Zoom {visual?.zoomAmount ?? 0}%
            <input
              type="range"
              min="0"
              max="5"
              step=".1"
              value={visual?.zoomAmount ?? 0}
              onChange={(e) =>
                patchVisual({ zoomAmount: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Pan {visual?.panAmount ?? 0}%
            <input
              type="range"
              min="-20"
              max="20"
              step="1"
              value={visual?.panAmount ?? 0}
              onChange={(e) =>
                patchVisual({ panAmount: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Pulse {visual?.pulseAmount ?? 0}
            <input
              type="range"
              min="0"
              max="5"
              step=".1"
              value={visual?.pulseAmount ?? 0}
              onChange={(e) =>
                patchVisual({ pulseAmount: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Brightness {visual?.brightness ?? 1}
            <input
              type="range"
              min=".25"
              max="2"
              step=".05"
              value={visual?.brightness ?? 1}
              onChange={(e) =>
                patchVisual({ brightness: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Fixation
            <select
              value={visual?.fixation ?? 'none'}
              onChange={(e) =>
                patchVisual({
                  fixation: e.target.value as 'none' | 'point' | 'spiral',
                })
              }
            >
              <option>none</option>
              <option>point</option>
              <option>spiral</option>
            </select>
          </label>
        </section>
        <section ref={stage} className="visual-stage" style={{ background }}>
          {current &&
            visual &&
            visual.backgroundType !== 'none' &&
            media &&
            (media.asset.kind === 'video' ? (
              <video
                ref={video}
                className={effectClass(visual, reducedMotion)}
                style={{
                  ...mediaStyle,
                  ...transitionStyle(current.transitionSettings, reducedMotion),
                }}
                src={media.url}
                loop
                muted
                playsInline
                preload="metadata"
                onError={() =>
                  setNotice(
                    'This WebView could not decode the selected video. The session and asset reference were preserved.',
                  )
                }
              />
            ) : (
              <img
                className={effectClass(visual, reducedMotion)}
                style={{
                  ...mediaStyle,
                  ...transitionStyle(current.transitionSettings, reducedMotion),
                }}
                src={media.url}
                alt="Local preview background"
                onError={() =>
                  setNotice(
                    'This WebView could not decode the selected image/GIF. The session and asset reference were preserved.',
                  )
                }
              />
            ))}
          {current && visual?.fixation === 'point' && (
            <span className="fixation-point" aria-hidden="true" />
          )}
          {current && visual?.fixation === 'spiral' && (
            <span
              className={`fixation-spiral ${reducedMotion ? '' : 'visual-spiral-active'}`}
              aria-hidden="true"
            />
          )}
          {snapshot.caption && current && (
            <div
              className={`visual-caption caption-${current.captionSettings.position}`}
              style={{
                fontSize: `${current.captionSettings.fontSize}px`,
                textAlign: current.captionSettings.alignment,
                opacity: current.captionSettings.opacity,
                transition: `opacity ${current.captionSettings.fadeDuration}s ease`,
              }}
            >
              {snapshot.caption}
            </div>
          )}
          <div className="visual-stage-label">
            {current?.title ?? 'No enabled block'} · {snapshot.transition}
          </div>
        </section>
      </div>
      <div className="visual-preview-controls">
        <button
          className="primary"
          disabled={
            !audio.speech.supported && !session.blocks.some((block) => block.audioSettings.narrationReference) ||
            snapshot.state === 'playing' ||
            snapshot.state === 'loading'
          }
          onClick={() => void engine.playSession(session)}
        >
          Play full preview
        </button>
        <button
          disabled={snapshot.state !== 'playing'}
          onClick={() => engine.pause()}
        >
          Pause
        </button>
        <button
          disabled={snapshot.state !== 'paused'}
          onClick={() => engine.resume()}
        >
          Resume
        </button>
        <button
          disabled={snapshot.state === 'idle'}
          onClick={() => engine.stop()}
        >
          Stop
        </button>
        <button onClick={() => void returnNow()}>RETURN NOW</button>
        <button
          disabled={!document.fullscreenEnabled}
          onClick={() =>
            stage.current
              ?.requestFullscreen?.()
              .catch(() =>
                setNotice('Fullscreen is unavailable in this WebView.'),
              )
          }
        >
          Fullscreen
        </button>
      </div>
      <p className="hint">
        Current block: {current?.title ?? 'none'} · audio clock{' '}
        {Math.round(snapshot.elapsedSeconds)}s. Local video is muted and looped;
        block changes reset the visual source. GIF playback uses native WebView
        image support and may render statically on limited hosts.
      </p>
    </section>
  );
}
