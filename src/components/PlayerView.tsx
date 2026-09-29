import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '../domain/schema';
import { AudioEngine } from '../audio/AudioEngine';
import { AudioMixer } from '../audio/AudioMixer';
import { BrowserSpeechEngine } from '../audio/BrowserSpeechEngine';
import { MediaResolver } from '../visual/MediaResolver';
import { VisualEngine } from '../visual/VisualEngine';
import { returnNow } from '../safety/returnNow';
import { SessionPlayer } from '../player/SessionPlayer';
import { playerCapabilities } from '../player/capabilities';
import {
  downloadSessionPackage,
  renderCapability,
} from '../player/PlayerExport';
import type { PlayerSnapshot } from '../player/types';

const initial: PlayerSnapshot = {
  state: 'idle',
  currentBlockId: null,
  elapsedSeconds: 0,
  progress: 0,
  caption: '',
  error: null,
};

export function PlayerView({
  session,
  onExit,
  onRecordNotes,
}: {
  session: Session;
  onExit: () => void;
  onRecordNotes?: (durationSeconds: number) => void;
}) {
  const resolver = useMemo(() => new MediaResolver(), []);
  const audio = useMemo(
    () => new AudioEngine(new BrowserSpeechEngine(), new AudioMixer(), resolver),
    [resolver],
  );
  const visualEngine = useMemo(() => new VisualEngine(audio), [audio]);
  const player = useMemo(
    () => new SessionPlayer(audio, visualEngine),
    [audio, visualEngine],
  );
  const [snapshot, setSnapshot] = useState(initial);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | 'gif' | null>(
    null,
  );
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const caps = useMemo(() => playerCapabilities(), []);
  const exportCap = useMemo(() => renderCapability(), []);
  const block =
    session.blocks.find((item) => item.id === snapshot.currentBlockId) ?? null;
  const unresolved = session.safetyReview.findings.filter(
    (finding) => finding.present && finding.status === 'unresolved',
  ).length;
  const structuralMissing = session.safetyReview.structuralChecks.filter(
    (check) => check.status === 'missing',
  ).length;

  useEffect(() => {
    const off = player.subscribe(setSnapshot);
    player.prepare(session);
    return () => {
      off();
      player.dispose();
      resolver.dispose();
    };
  }, [player, resolver, session]);
  useEffect(() => {
    let active = true;
    if (!block?.visualSettings.mediaReference) {
      setMediaUrl(null);
      setMediaKind(null);
      return;
    }
    void resolver
      .resolve(block.visualSettings.mediaReference)
      .then((media) => {
        if (!active) return;
        setMediaUrl(media?.url ?? null);
        setMediaKind(media?.asset.kind ?? null);
      })
      .catch(() => {
        if (active) {
          setMediaUrl(null);
          setMediaKind(null);
        }
      });
    return () => {
      active = false;
    };
  }, [block, resolver]);
  useEffect(() => {
    visualEngine.attachVideo(video.current);
    if (!video.current) return;
    if (snapshot.state === 'paused') video.current.pause();
    if (snapshot.state === 'playing')
      void video.current.play().catch(() => undefined);
  }, [snapshot.state, mediaUrl, visualEngine]);

  const start = async () => {
    if (caps.fullscreen && stage.current?.requestFullscreen)
      await stage.current.requestFullscreen().catch(() => undefined);
    await player.start();
  };
  const stop = () => {
    player.stop();
    if (document.fullscreenElement && document.exitFullscreen)
      void document.exitFullscreen().catch(() => undefined);
  };
  const exit = () => {
    stop();
    onExit();
  };
  const visual = block?.visualSettings;
  const reduced = caps.reducedMotion;
  const style = visual
    ? {
        background:
          visual.backgroundType === 'gradient'
            ? visual.gradient
            : visual.backgroundColor,
        opacity: visual.opacity,
        filter: `blur(${visual.blur}px) brightness(${visual.brightness})`,
      }
    : undefined;

  return (
    <section className="player-shell" aria-label="Session player">
      <div ref={stage} className="player-stage" style={style}>
        {mediaUrl &&
          (mediaKind === 'video' ? (
            <video
              ref={video}
              src={mediaUrl}
              muted
              loop
              playsInline
              className="player-media"
            />
          ) : (
            <img
              src={mediaUrl}
              alt=""
              className={`player-media ${reduced ? '' : 'player-motion'}`}
            />
          ))}
        <div className="player-overlay">
          <button
            className="return-now player-return"
            onClick={() => void returnNow()}
          >
            RETURN NOW
          </button>
          {snapshot.caption && (
            <p className="player-caption">{snapshot.caption}</p>
          )}
          <div className="player-controls">
            <strong>
              {block?.title ??
                (snapshot.state === 'completed'
                  ? 'Session complete'
                  : session.title)}
            </strong>
            <span>
              {Math.floor(snapshot.elapsedSeconds)}s ·{' '}
              {Math.round(snapshot.progress * 100)}%
            </span>
            <progress
              max={1}
              value={snapshot.progress}
              aria-label="Session progress"
            />
            {snapshot.state === 'ready' && (
              <button className="primary" onClick={() => void start()}>
                Start Session
              </button>
            )}
            {snapshot.state === 'playing' && (
              <button onClick={() => player.pause()}>Pause</button>
            )}
            {snapshot.state === 'paused' && (
              <button onClick={() => void player.resume()}>Resume</button>
            )}
            {['playing', 'paused', 'preparing'].includes(snapshot.state) && (
              <button onClick={stop}>Stop</button>
            )}
            {caps.fullscreen && (
              <button
                onClick={() =>
                  stage.current?.requestFullscreen?.().catch(() => undefined)
                }
              >
                Fullscreen
              </button>
            )}
            {snapshot.state === 'completed' && (
              <>
                {onRecordNotes && (
                  <button
                    className="primary"
                    onClick={() => {
                      stop();
                      onRecordNotes(Math.round(snapshot.elapsedSeconds));
                    }}
                  >
                    Record Session Notes
                  </button>
                )}
                <button onClick={exit}>Exit player</button>
              </>
            )}
            {snapshot.state === 'error' && (
              <>
                <p role="alert">{snapshot.error}</p>
                <button onClick={() => player.retry()}>Retry</button>
                <button onClick={exit}>Exit</button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="player-preflight">
        <h2>Session player</h2>
        <p>
          <strong>
            {session.safetyReview.status === 'reviewed'
              ? 'Review complete'
              : 'Review incomplete'}
          </strong>{' '}
          · {unresolved} unresolved finding(s) · {structuralMissing} structural
          check(s) missing.
        </p>
        {unresolved > 0 && (
          <p className="notice">
            Unresolved findings remain. Playback does not alter or censor the
            narration.
          </p>
        )}
        <p>
          Reduced motion: {caps.reducedMotion ? 'on' : 'off'} · Fullscreen:{' '}
          {caps.fullscreen ? 'available' : 'unavailable'}.
        </p>
        <p>
          Rendered export:{' '}
          {exportCap.supported
            ? `WebM capability reported (${exportCap.mimeType})`
            : exportCap.reason}
        </p>
        <button
          onClick={() => {
            try {
              downloadSessionPackage(session);
            } catch {
              /* UI remains recoverable */
            }
          }}
        >
          Export Session Package
        </button>
        <button onClick={onExit}>Back to editor</button>
      </div>
    </section>
  );
}
