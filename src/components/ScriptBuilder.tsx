import { useEffect, useMemo, useRef, useState } from 'react';
import {
  backgroundTypes,
  blockTypes,
  captionModes,
  transitionTypes,
  type Session,
  type SessionBlock,
} from '../domain/schema';
import {
  addBlock,
  appendImportedParts,
  countWords,
  createBlock,
  deleteBlock,
  duplicateBlock,
  effectiveDuration,
  importTextToDraft,
  moveBlock,
  splitImportedText,
  timelineForSession,
  updateBlock,
  type ImportedTextDraft,
} from '../domain/scriptBuilder';

function clock(total: number) {
  const seconds = Math.max(0, Math.round(total));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function bounded(value: string, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}
function hasContent(block: SessionBlock) {
  return Boolean(
    block.narration.trim() ||
    block.notes.trim() ||
    block.visualSettings.mediaReference ||
    block.audioSettings.musicReference ||
    block.audioSettings.ambientReference,
  );
}

export function ScriptBuilder({
  session,
  wordsPerMinute,
  onChange,
  focusBlockId,
}: {
  session: Session;
  wordsPerMinute: number;
  onChange: (session: Session) => void;
  focusBlockId?: string;
}) {
  const [activeId, setActiveId] = useState(session.blocks[0]?.id ?? '');
  const [importDraft, setImportDraft] = useState<ImportedTextDraft | null>(
    null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const timeline = useMemo(
    () => timelineForSession(session, wordsPerMinute),
    [session, wordsPerMinute],
  );
  useEffect(() => {
    if (
      focusBlockId &&
      session.blocks.some((block) => block.id === focusBlockId)
    ) {
      setActiveId(focusBlockId);
    }
  }, [focusBlockId, session.blocks]);

  const active =
    session.blocks.find((block) => block.id === activeId) ??
    session.blocks[0] ??
    null;
  const activeIndex = active
    ? session.blocks.findIndex((block) => block.id === active.id)
    : -1;
  const setSession = (next: Session) => {
    const durationEstimate = timelineForSession(next, wordsPerMinute)
      .filter((item) => item.enabled)
      .reduce((total, item) => total + item.duration, 0);
    next = { ...next, durationEstimate };
    onChange(next);
    if (!activeId && next.blocks[0]) setActiveId(next.blocks[0].id);
  };
  const patch = (change: Partial<SessionBlock>) => {
    if (active) setSession(updateBlock(session, active.id, change));
  };
  const nested = <
    K extends
      | 'voiceSettings'
      | 'visualSettings'
      | 'audioSettings'
      | 'captionSettings'
      | 'transitionSettings',
  >(
    key: K,
    change: Partial<SessionBlock[K]>,
  ) => {
    if (!active) return;
    patch({ [key]: { ...active[key], ...change } } as Partial<SessionBlock>);
  };
  const add = () => {
    const block = createBlock();
    setSession(addBlock(session, block));
    setActiveId(block.id);
  };
  const remove = () => {
    if (!active) return;
    if (
      hasContent(active) &&
      !window.confirm(
        `Delete populated block “${active.title || active.type}”?`,
      )
    )
      return;
    const next = deleteBlock(session, active.id);
    const replacement =
      next.blocks[Math.min(activeIndex, next.blocks.length - 1)];
    setSession(next);
    setActiveId(replacement?.id ?? '');
  };
  const move = (delta: -1 | 1) => {
    if (active) setSession(moveBlock(session, active.id, delta));
  };
  const duplicate = () => {
    if (!active) return;
    const next = duplicateBlock(session, active.id);
    const index = next.blocks.findIndex((block) => block.id === active.id);
    setSession(next);
    setActiveId(next.blocks[index + 1]?.id ?? active.id);
  };
  const applyImport = () => {
    if (!importDraft) return;
    const next = appendImportedParts(
      session,
      splitImportedText(importDraft.workingText),
      { ...importDraft, confirmed: true },
    );
    setSession(next);
    setActiveId(next.blocks[session.blocks.length]?.id ?? activeId);
    setImportDraft(null);
  };

  return (
    <section className="builder" aria-label="Script builder">
      <div className="builder-toolbar">
        <button type="button" className="primary" onClick={add}>
          Add block
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import TXT / Markdown
        </button>
        <button
          type="button"
          onClick={() => setImportDraft(importTextToDraft('', 'Pasted text'))}
        >
          Paste text
        </button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          aria-label="Import TXT or Markdown file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () =>
              setImportDraft(
                importTextToDraft('Could not read file.', file.name),
              );
            reader.onload = () =>
              setImportDraft(
                importTextToDraft(String(reader.result ?? ''), file.name),
              );
            reader.readAsText(file);
          }}
        />
        <span className="hint">{wordsPerMinute} WPM estimate · not exact</span>
      </div>

      {importDraft && (
        <section className="import-review" aria-label="Imported text review">
          <h3>Review imported text</h3>
          <p>
            <strong>{importDraft.fileName}</strong> stays local. Nothing is
            executable or saved until you add the proposed blocks and review the
            session.
          </p>
          <label>
            Imported text preview
            <textarea
              rows={10}
              value={importDraft.workingText}
              onChange={(event) =>
                setImportDraft({
                  ...importDraft,
                  workingText: event.target.value,
                })
              }
            />
          </label>
          <p className="hint">
            Basic headings such as Arrival, Deepening, Main, Return and Exit are
            suggestions only. You can correct every resulting block. Imports are
            limited to 1,000,000 characters.
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={
                !importDraft.workingText.trim() ||
                importDraft.originalText.length > 1000000
              }
              onClick={applyImport}
            >
              Confirm and add proposed blocks
            </button>
            <button type="button" onClick={() => setImportDraft(null)}>
              Cancel import
            </button>
          </div>
        </section>
      )}

      <div className="builder-grid">
        <div className="block-panel" aria-label="Block list and timeline">
          <h2>Timeline</h2>
          <div className="timeline-list">
            {timeline.map((item) => {
              const block = session.blocks[item.order - 1];
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`timeline-row ${active?.id === item.id ? 'active' : ''}`}
                  onClick={() => setActiveId(item.id)}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!dragId || dragId === item.id) return;
                    const from = session.blocks.findIndex(
                      (entry) => entry.id === dragId,
                    );
                    const to = session.blocks.findIndex(
                      (entry) => entry.id === item.id,
                    );
                    let next = session;
                    const step: -1 | 1 = from < to ? 1 : -1;
                    for (let index = from; index !== to; index += step)
                      next = moveBlock(next, dragId, step);
                    setSession(next);
                    setDragId(null);
                  }}
                >
                  <span>{String(item.order).padStart(2, '0')}</span>
                  <strong>{block.title || block.type}</strong>
                  <small>
                    {clock(item.start)}–{clock(item.end)} ·{' '}
                    {clock(item.duration)} {item.enabled ? '' : '· disabled'}
                  </small>
                </button>
              );
            })}
            {!timeline.length && (
              <p className="hint">No blocks yet. Add one or import text.</p>
            )}
          </div>
          <div className="stack-actions">
            <button
              type="button"
              disabled={!active || activeIndex === 0}
              onClick={() => move(-1)}
            >
              Move Up
            </button>
            <button
              type="button"
              disabled={!active || activeIndex === session.blocks.length - 1}
              onClick={() => move(1)}
            >
              Move Down
            </button>
            <button type="button" disabled={!active} onClick={duplicate}>
              Duplicate block
            </button>
            <button type="button" disabled={!active} onClick={remove}>
              Delete block
            </button>
          </div>
        </div>

        <div className="block-editor">
          {!active ? (
            <p>Select or add a block to edit.</p>
          ) : (
            <>
              <div className="editor-section">
                <h2>General</h2>
                <label>
                  Title
                  <input
                    value={active.title}
                    maxLength={200}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={active.type}
                    onChange={(event) =>
                      patch({
                        type: event.target.value as SessionBlock['type'],
                      })
                    }
                  >
                    {blockTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={active.enabled}
                    onChange={(event) =>
                      patch({ enabled: event.target.checked })
                    }
                  />{' '}
                  Enabled
                </label>
                <div className="duration-readout">
                  <span>
                    Calculated duration{' '}
                    <strong>
                      {clock(
                        effectiveDuration(
                          { ...active, manualDurationOverride: null },
                          wordsPerMinute,
                        ),
                      )}
                    </strong>
                  </span>
                  <label>
                    Manual override (seconds)
                    <input
                      type="number"
                      min="0"
                      max="86400"
                      value={active.manualDurationOverride ?? ''}
                      placeholder="Use calculated"
                      onChange={(event) =>
                        patch({
                          manualDurationOverride:
                            event.target.value === ''
                              ? null
                              : Math.round(
                                  bounded(event.target.value, 0, 86400),
                                ),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="private-notes">
                  PRIVATE NOTES · editor only
                  <textarea
                    rows={5}
                    maxLength={10000}
                    value={active.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                  />
                  <small>
                    Never automatically becomes narration, captions, or rendered
                    output.
                  </small>
                </label>
              </div>
              <div className="editor-section narration-section">
                <h2>NARRATION</h2>
                <label>
                  Spoken narration
                  <textarea
                    rows={16}
                    maxLength={100000}
                    value={active.narration}
                    onChange={(event) =>
                      patch({
                        narration: event.target.value,
                        estimatedDuration: Math.round(
                          (countWords(event.target.value) / wordsPerMinute) *
                            60,
                        ),
                      })
                    }
                  />
                </label>
                <p className="hint">
                  {countWords(active.narration)} words · calculated speech
                  duration{' '}
                  {clock(
                    effectiveDuration(
                      { ...active, manualDurationOverride: null },
                      wordsPerMinute,
                    ),
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="inspector" aria-label="Block settings inspector">
          {!active ? (
            <p className="hint">Block settings appear here.</p>
          ) : (
            <>
              <details open>
                <summary>Voice settings</summary>
                <label>
                  Voice identifier
                  <input
                    value={active.voiceSettings.voiceId}
                    onChange={(event) =>
                      nested('voiceSettings', { voiceId: event.target.value })
                    }
                  />
                </label>
                <label>
                  Speech rate
                  <input
                    type="number"
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={active.voiceSettings.rate}
                    onChange={(event) =>
                      nested('voiceSettings', {
                        rate: bounded(event.target.value, 0.5, 2),
                      })
                    }
                  />
                </label>
                <label>
                  Pitch
                  <input
                    type="number"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={active.voiceSettings.pitch}
                    onChange={(event) =>
                      nested('voiceSettings', {
                        pitch: bounded(event.target.value, -12, 12),
                      })
                    }
                  />
                </label>
                <label>
                  Volume
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={active.voiceSettings.volume}
                    onChange={(event) =>
                      nested('voiceSettings', {
                        volume: bounded(event.target.value, 0, 1),
                      })
                    }
                  />
                </label>
              </details>
              <details>
                <summary>Caption settings</summary>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={active.captionSettings.enabled}
                    onChange={(event) =>
                      nested('captionSettings', {
                        enabled: event.target.checked,
                      })
                    }
                  />{' '}
                  Captions enabled
                </label>
                <label>
                  Mode
                  <select
                    value={active.captionSettings.mode}
                    onChange={(event) =>
                      nested('captionSettings', {
                        mode: event.target
                          .value as SessionBlock['captionSettings']['mode'],
                      })
                    }
                  >
                    {captionModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Font size
                  <input
                    type="number"
                    min="8"
                    max="200"
                    value={active.captionSettings.fontSize}
                    onChange={(event) =>
                      nested('captionSettings', {
                        fontSize: Math.round(
                          bounded(event.target.value, 8, 200),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Alignment
                  <select
                    value={active.captionSettings.alignment}
                    onChange={(event) =>
                      nested('captionSettings', {
                        alignment: event.target.value as
                          'left' | 'center' | 'right',
                      })
                    }
                  >
                    <option>left</option>
                    <option>center</option>
                    <option>right</option>
                  </select>
                </label>
                <label>
                  Position
                  <select
                    value={active.captionSettings.position}
                    onChange={(event) =>
                      nested('captionSettings', {
                        position: event.target.value as
                          'top' | 'middle' | 'bottom',
                      })
                    }
                  >
                    <option>top</option>
                    <option>middle</option>
                    <option>bottom</option>
                  </select>
                </label>
                <label>
                  Opacity
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={active.captionSettings.opacity}
                    onChange={(event) =>
                      nested('captionSettings', {
                        opacity: bounded(event.target.value, 0, 1),
                      })
                    }
                  />
                </label>
              </details>
              <details>
                <summary>Visual settings</summary>
                <label>
                  Media reference
                  <input
                    value={active.visualSettings.mediaReference}
                    onChange={(event) =>
                      nested('visualSettings', {
                        mediaReference: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Background type
                  <select
                    value={active.visualSettings.backgroundType}
                    onChange={(event) =>
                      nested('visualSettings', {
                        backgroundType: event.target
                          .value as SessionBlock['visualSettings']['backgroundType'],
                      })
                    }
                  >
                    {backgroundTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Opacity
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={active.visualSettings.opacity}
                    onChange={(event) =>
                      nested('visualSettings', {
                        opacity: bounded(event.target.value, 0, 1),
                      })
                    }
                  />
                </label>
                <label>
                  Blur
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={active.visualSettings.blur}
                    onChange={(event) =>
                      nested('visualSettings', {
                        blur: bounded(event.target.value, 0, 100),
                      })
                    }
                  />
                </label>
                <label>
                  Zoom amount
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={active.visualSettings.zoomAmount}
                    onChange={(event) =>
                      nested('visualSettings', {
                        zoomAmount: bounded(event.target.value, 0, 5),
                      })
                    }
                  />
                </label>
                <label>
                  Pulse amount
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={active.visualSettings.pulseAmount}
                    onChange={(event) =>
                      nested('visualSettings', {
                        pulseAmount: bounded(event.target.value, 0, 5),
                      })
                    }
                  />
                </label>
                <label>
                  Transition type
                  <select
                    value={active.visualSettings.transitionType}
                    onChange={(event) =>
                      nested('visualSettings', {
                        transitionType: event.target
                          .value as SessionBlock['visualSettings']['transitionType'],
                      })
                    }
                  >
                    {transitionTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </details>
              <details>
                <summary>Audio settings</summary>
                <label>
                  Music reference
                  <input
                    value={active.audioSettings.musicReference}
                    onChange={(event) =>
                      nested('audioSettings', {
                        musicReference: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Ambient reference
                  <input
                    value={active.audioSettings.ambientReference}
                    onChange={(event) =>
                      nested('audioSettings', {
                        ambientReference: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Music level
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={active.audioSettings.musicLevel}
                    onChange={(event) =>
                      nested('audioSettings', {
                        musicLevel: bounded(event.target.value, 0, 1),
                      })
                    }
                  />
                </label>
                <label>
                  Ambient level
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={active.audioSettings.ambientLevel}
                    onChange={(event) =>
                      nested('audioSettings', {
                        ambientLevel: bounded(event.target.value, 0, 1),
                      })
                    }
                  />
                </label>
                <label>
                  Fade in (seconds)
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={active.audioSettings.fadeInDuration}
                    onChange={(event) =>
                      nested('audioSettings', {
                        fadeInDuration: bounded(event.target.value, 0, 300),
                      })
                    }
                  />
                </label>
                <label>
                  Fade out (seconds)
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={active.audioSettings.fadeOutDuration}
                    onChange={(event) =>
                      nested('audioSettings', {
                        fadeOutDuration: bounded(event.target.value, 0, 300),
                      })
                    }
                  />
                </label>
              </details>
              <details>
                <summary>Transition settings</summary>
                <label>
                  Type
                  <select
                    value={active.transitionSettings.type}
                    onChange={(event) =>
                      nested('transitionSettings', {
                        type: event.target
                          .value as SessionBlock['transitionSettings']['type'],
                      })
                    }
                  >
                    {transitionTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Duration (seconds)
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={active.transitionSettings.duration}
                    onChange={(event) =>
                      nested('transitionSettings', {
                        duration: bounded(event.target.value, 0, 30),
                      })
                    }
                  />
                </label>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
