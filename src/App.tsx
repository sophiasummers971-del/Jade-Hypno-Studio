import { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '@platform';
import type { Lifecycle } from './platform/contracts';
import {
  downloadSession,
  importSessionJson,
  readJsonFile,
} from './storage/portable';
import {
  modes,
  resolutions,
  parseSession,
  type Session,
  type Settings,
} from './domain/schema';
import {
  duplicateSession,
  type Repository,
  type SessionList,
} from './storage/repository';
import { Autosave, type SaveState } from './storage/autosave';
import { ErrorNotice, errorDetail } from './components/ErrorNotice';
import { Modal } from './components/Modal';
import { ScriptBuilder } from './components/ScriptBuilder';
import {
  createSessionFromTemplate,
  type TemplateId,
} from './domain/scriptBuilder';

type View =
  | 'Home'
  | 'Sessions'
  | 'New Session'
  | 'Session Editor'
  | 'Settings'
  | 'About / Safety';
const emptyList: SessionList = { sessions: [], issues: [] };
export function App({
  repo = platform.repository,
  lifecycle = platform.lifecycle,
}: {
  repo?: Repository;
  lifecycle?: Lifecycle;
}) {
  const [view, setView] = useState<View>('Home');
  const [list, setList] = useState(emptyList);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<TemplateId>('immersive-fantasy');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<{
    message: string;
    detail: string;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [action, setAction] = useState<{
    type: 'rename' | 'delete' | 'reopen';
    session: Session;
  } | null>(null);
  const [rename, setRename] = useState('');
  const writer = useRef<Autosave | null>(null);
  const guard = useRef(false);
  const latest = useRef({ settings, draftSettings });
  latest.current = { settings, draftSettings };
  const importInput = useRef<HTMLInputElement>(null);
  const settingsFlight = useRef<Promise<void> | null>(null);
  const report = useCallback(
    (message: string, problem: unknown) =>
      setError({ message, detail: errorDetail(problem) }),
    [],
  );
  const refresh = useCallback(async () => setList(await repo.list()), [repo]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await repo.loadSettings();
        if (!cancelled) {
          setSettings(loaded);
          setDraftSettings(loaded);
        }
      } catch (problem) {
        if (!cancelled)
          report(
            'Settings could not be loaded. The original data has been preserved; see diagnostics.',
            problem,
          );
      }
      try {
        const loaded = await repo.list();
        if (!cancelled) setList(loaded);
      } catch (problem) {
        if (!cancelled) report('Sessions could not be listed.', problem);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, report]);
  useEffect(() => () => writer.current?.dispose(), []);
  const flushSettings = useCallback(async () => {
    if (settingsFlight.current) return settingsFlight.current;
    settingsFlight.current = (async () => {
      while (
        latest.current.draftSettings &&
        JSON.stringify(latest.current.settings) !==
          JSON.stringify(latest.current.draftSettings)
      ) {
        const draft = latest.current.draftSettings;
        const result = await repo.saveSettings(draft);
        const newest = latest.current.draftSettings;
        setSettings(result);
        if (JSON.stringify(newest) === JSON.stringify(draft)) {
          setDraftSettings(result);
          latest.current = { settings: result, draftSettings: result };
        } else latest.current = { settings: result, draftSettings: newest };
      }
    })();
    try {
      await settingsFlight.current;
    } finally {
      settingsFlight.current = null;
    }
  }, [repo]);
  const flushAll = useCallback(async () => {
    await writer.current?.flush();
    await flushSettings();
  }, [flushSettings]);
  useEffect(() => {
    if (JSON.stringify(settings) === JSON.stringify(draftSettings)) return;
    const timer = setTimeout(() => {
      void flushSettings().catch((problem) =>
        report(
          'Settings have not been saved. Retry Save settings or export your work.',
          problem,
        ),
      );
    }, 600);
    return () => clearTimeout(timer);
  }, [settings, draftSettings, flushSettings, report]);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void lifecycle({
      isDirty: () =>
        Boolean(writer.current?.dirty) ||
        JSON.stringify(latest.current.settings) !==
          JSON.stringify(latest.current.draftSettings),
      flush: flushAll,
      requestClose: async () => {
        if (guard.current) return false;
        guard.current = true;
        setBusy(true);
        try {
          await flushAll();
          return true;
        } catch (problem) {
          report(
            'Could not save before closing. The window remains open; fix the issue and retry.',
            problem,
          );
          return false;
        } finally {
          guard.current = false;
          setBusy(false);
        }
      },
      report,
    })
      .then((remove) => {
        if (disposed) remove();
        else cleanup = remove;
      })
      .catch((problem) =>
        report(
          'Lifecycle save protection could not start. Save manually before closing.',
          problem,
        ),
      );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [lifecycle, flushAll, report]);
  async function run(task: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setStatus('');
    try {
      await task();
    } catch (problem) {
      report('The local operation could not be completed.', problem);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function openEditor(value: Session) {
    writer.current?.dispose();
    writer.current = new Autosave(repo, value, (state, saved, problem) => {
      setSaveState(state);
      if (saved) setSession(saved);
      if (problem)
        report(
          'Save failed. Your changes have not been saved. Use Save to retry.',
          problem,
        );
    });
    setSession(value);
    setSaveState('saved');
    setView('Session Editor');
    setError(null);
  }
  function edit(next: Session) {
    setSession(next);
    writer.current?.edit(next);
  }
  function navigate(next: View) {
    void run(async () => {
      await flushAll();
      if (next === 'Sessions' || next === 'Home') await refresh();
      setView(next);
    });
  }
  const settingsDirty =
    JSON.stringify(settings) !== JSON.stringify(draftSettings);
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="monogram" aria-hidden="true">
            J
          </span>
          <div>
            JADE<span>HYPNO STUDIO</span>
          </div>
        </div>
        <p className="eyebrow">PERSONAL WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              'Home',
              'Sessions',
              'New Session',
              'Settings',
              'About / Safety',
            ] as View[]
          ).map((item) => (
            <button
              key={item}
              aria-current={view === item ? 'page' : undefined}
              disabled={busy}
              onClick={() => navigate(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="dot" /> Local & private
          <p>Script Builder · Milestone 2</p>
        </div>
      </aside>
      <main aria-busy={busy}>
        <header>
          <p className="eyebrow">YOUR SPACE. YOUR CONTROL.</p>
          <span className="badge">SCRIPT BUILDER / 02</span>
        </header>
        {!ready && <p role="status">Opening local workspace…</p>}
        {error && <ErrorNotice {...error} dismiss={() => setError(null)} />}
        {status && (
          <p role="status" className="notice">
            {status}
          </p>
        )}
        {view === 'Home' && (
          <>
            <h1>A quiet place to create.</h1>
            <p className="lead">
              Build your personal session library, one idea at a time.
            </p>
            <section className="welcome">
              <p className="eyebrow">JADE HYPNO STUDIO</p>
              <h2>Start with a blank session.</h2>
              <p>
                Give it a name, set its direction, and keep your work on this
                device.
              </p>
              <button
                className="primary"
                disabled={!settings || busy}
                onClick={() => navigate('New Session')}
              >
                New session <span aria-hidden="true">＋</span>
              </button>
            </section>
            <div className="cards">
              <section>
                <h2>{list.sessions.length} saved sessions</h2>
                <p>{platform.storageLabel}.</p>
                <button
                  disabled={!ready || busy}
                  onClick={() => navigate('Sessions')}
                >
                  View sessions
                </button>
              </section>
              <section>
                <h2>Foundation only</h2>
                <p>
                  Session metadata and local saving are available. Playback,
                  voices and rendering come later.
                </p>
                <button
                  onClick={() => navigate('About / Safety')}
                  disabled={busy}
                >
                  About this build
                </button>
              </section>
            </div>
          </>
        )}
        {view === 'Sessions' && (
          <>
            <h1>Sessions</h1>
            <p className="lead">
              Your local collection. Open a session to continue.
            </p>
            <button
              className="primary"
              disabled={!settings || busy}
              onClick={() => navigate('New Session')}
            >
              New session
            </button>
            <input
              ref={importInput}
              className="sr-only"
              aria-label="Import session JSON file"
              type="file"
              accept=".json,application/json"
              disabled={busy || !settings}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void run(async () => {
                  const json = await readJsonFile(file);
                  // Validate before touching persistence, including unrelated drafts.
                  parseSession(json);
                  await flushAll();
                  const imported = await importSessionJson(repo, json);
                  openEditor(imported);
                  setStatus(
                    'Imported locally with a new session ID. Existing sessions were not overwritten.',
                  );
                });
              }}
            />
            <button
              disabled={busy || !settings}
              onClick={() => importInput.current?.click()}
            >
              Import session JSON
            </button>
            <p className="hint">
              Imports are validated and saved as new sessions. Nothing is
              uploaded.
            </p>
            {list.issues.length > 0 && (
              <section className="error">
                <h2>Some files could not be opened</h2>
                <p>
                  Original records were left unchanged. Check diagnostics before
                  attempting manual recovery.
                </p>
                {list.issues.map((issue) => (
                  <details key={issue.file}>
                    <summary>{issue.file}</summary>
                    <pre>{issue.message}</pre>
                  </details>
                ))}
              </section>
            )}
            <div className="session-list">
              {list.sessions.length === 0 ? (
                <section>
                  <h2>No sessions yet</h2>
                  <p>Create a blank session to begin.</p>
                </section>
              ) : (
                list.sessions.map((item) => (
                  <article className="session-row" key={item.id}>
                    <div>
                      <h2>{item.title}</h2>
                      <p>
                        {item.mode} · {Math.round(item.durationEstimate / 60)}{' '}
                        min · Modified{' '}
                        {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await flushAll();
                            openEditor(await repo.load(item.id));
                          })
                        }
                      >
                        Open <span className="sr-only">{item.title}</span>
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await duplicateSession(
                              repo,
                              await repo.load(item.id),
                            );
                            await refresh();
                            setStatus('Session duplicated.');
                          })
                        }
                      >
                        Duplicate <span className="sr-only">{item.title}</span>
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setAction({ type: 'rename', session: item });
                          setRename(item.title);
                        }}
                      >
                        Rename <span className="sr-only">{item.title}</span>
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          setAction({ type: 'delete', session: item })
                        }
                      >
                        Delete <span className="sr-only">{item.title}</span>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
        {view === 'New Session' && (
          <>
            <h1>New session</h1>
            <p className="lead">
              Choose a structural starting point. No generated scripts or
              playback.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (!settings) throw new Error('Settings are unavailable.');
                  await flushAll();
                  const created = await repo.save(
                    createSessionFromTemplate(title, template, settings),
                    null,
                  );
                  setTitle('');
                  setTemplate('immersive-fantasy');
                  openEditor(created);
                });
              }}
            >
              <fieldset disabled={!settings || busy}>
                <label>
                  Session title
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  Structural template
                  <select
                    value={template}
                    onChange={(event) =>
                      setTemplate(event.target.value as TemplateId)
                    }
                  >
                    <option value="blank">Blank Session</option>
                    <option value="relaxation">Relaxation</option>
                    <option value="immersive-fantasy">Immersive Fantasy</option>
                    <option value="adult-immersive">
                      Adult Immersive Session
                    </option>
                  </select>
                </label>
                <p>
                  Templates create independent block structures only. They do
                  not add generated scripts, playback, or rendering.
                </p>
                <button className="primary" disabled={!title.trim()}>
                  Create session
                </button>
              </fieldset>
            </form>
          </>
        )}
        {view === 'Session Editor' && session && (
          <>
            <div className="page-heading">
              <div>
                <h1>Session editor</h1>
                <p className="lead">
                  Create, structure, edit and review the complete session before
                  rendering.
                </p>
              </div>
              <span role="status" className={`badge save-${saveState}`}>
                {
                  {
                    saved: 'Saved locally',
                    unsaved: 'Unsaved changes',
                    saving: 'Saving…',
                    error: 'Not saved — retry',
                  }[saveState]
                }
              </span>
            </div>
            <fieldset disabled={busy}>
              <label>
                Title
                <input
                  maxLength={200}
                  value={session.title}
                  onChange={(event) =>
                    edit({ ...session, title: event.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={5}
                  maxLength={10000}
                  value={session.description}
                  onChange={(event) =>
                    edit({ ...session, description: event.target.value })
                  }
                />
              </label>
              <label>
                Mode
                <select
                  value={session.mode}
                  onChange={(event) =>
                    edit({
                      ...session,
                      mode: event.target.value as Session['mode'],
                    })
                  }
                >
                  {modes.map((mode) => (
                    <option key={mode}>{mode}</option>
                  ))}
                </select>
              </label>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() =>
                    void run(async () => {
                      await writer.current?.flush();
                      setError(null);
                      setStatus('Session saved locally.');
                    })
                  }
                >
                  Save
                </button>
                <button
                  onClick={() =>
                    void run(async () => {
                      const source = writer.current?.snapshot;
                      if (!source) return;
                      const copy = await duplicateSession(repo, source);
                      setStatus(
                        `Saved a separate copy: ${copy.title}. You are still editing the original.`,
                      );
                    })
                  }
                >
                  Save as copy
                </button>
                <button
                  onClick={() => {
                    try {
                      const draft = writer.current?.snapshot;
                      if (!draft) return;
                      downloadSession(draft);
                      setStatus(
                        'JSON download requested. Check your device’s downloads; this does not confirm the file was saved.',
                      );
                    } catch (problem) {
                      report('Could not export this session.', problem);
                    }
                  }}
                >
                  Export session JSON
                </button>
                <button
                  disabled={saveState === 'saving'}
                  onClick={() => setAction({ type: 'reopen', session })}
                >
                  Reopen saved version
                </button>
              </div>
            </fieldset>
            <ScriptBuilder
              session={session}
              wordsPerMinute={settings?.wordsPerMinute ?? 150}
              onChange={edit}
            />
            <details className="metadata">
              <summary>Session metadata</summary>
              <dl>
                <dt>ID</dt>
                <dd>{session.id}</dd>
                <dt>Created</dt>
                <dd>{new Date(session.createdAt).toLocaleString()}</dd>
                <dt>Last saved</dt>
                <dd>{new Date(session.updatedAt).toLocaleString()}</dd>
                <dt>Estimated duration</dt>
                <dd>{session.durationEstimate / 60} minutes</dd>
                <dt>Schema</dt>
                <dd>Version {session.schemaVersion}</dd>
              </dl>
            </details>
          </>
        )}
        {view === 'Settings' && (
          <>
            <h1>Settings</h1>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await flushAll();
                  window.location.assign('./capabilities.html');
                })
              }
            >
              Device capability check
            </button>
            <p className="lead">
              Defaults for new sessions. Existing sessions keep their settings.
            </p>
            {draftSettings ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await flushAll();
                    setStatus('Settings saved locally.');
                  });
                }}
              >
                <fieldset disabled={busy}>
                  <div className="form-grid">
                    <label>
                      Default duration (minutes)
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        required
                        value={draftSettings.defaultSessionDuration}
                        onChange={(event) =>
                          setDraftSettings({
                            ...draftSettings,
                            defaultSessionDuration: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Words per minute estimate
                      <input
                        type="number"
                        min={60}
                        max={300}
                        required
                        value={draftSettings.wordsPerMinute}
                        onChange={(event) =>
                          setDraftSettings({
                            ...draftSettings,
                            wordsPerMinute: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Output resolution
                      <select
                        value={draftSettings.defaultOutputResolution}
                        onChange={(event) =>
                          setDraftSettings({
                            ...draftSettings,
                            defaultOutputResolution: event.target
                              .value as Settings['defaultOutputResolution'],
                          })
                        }
                      >
                        {resolutions.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    TTS voice identifier (placeholder)
                    <input
                      maxLength={256}
                      value={draftSettings.defaultVoiceId}
                      onChange={(event) =>
                        setDraftSettings({
                          ...draftSettings,
                          defaultVoiceId: event.target.value,
                        })
                      }
                    />
                  </label>
                  <p className="hint">
                    Stored as a preference only. No voice service is connected.
                  </p>
                  <label>
                    Default export directory (placeholder)
                    <input
                      maxLength={4096}
                      value={draftSettings.defaultExportDirectory}
                      placeholder="Not set"
                      onChange={(event) =>
                        setDraftSettings({
                          ...draftSettings,
                          defaultExportDirectory: event.target.value,
                        })
                      }
                    />
                  </label>
                  <p className="hint">
                    Text preference only; no files are written to this path.
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draftSettings.captionsEnabled}
                      onChange={(event) =>
                        setDraftSettings({
                          ...draftSettings,
                          captionsEnabled: event.target.checked,
                        })
                      }
                    />{' '}
                    Enable captions by default
                  </label>
                  {(
                    [
                      'defaultNarrationLevel',
                      'defaultMusicLevel',
                      'defaultAmbientLevel',
                    ] as const
                  ).map((key, index) => (
                    <label key={key}>
                      {['Narration', 'Music', 'Ambient'][index]} level:{' '}
                      {Math.round(draftSettings[key] * 100)}%
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={draftSettings[key]}
                        onChange={(event) =>
                          setDraftSettings({
                            ...draftSettings,
                            [key]: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                  <div className="actions">
                    <button className="primary" type="submit">
                      Save settings
                    </button>
                    <span role="status">
                      {settingsDirty
                        ? 'Unsaved settings · autosave pending'
                        : 'Settings saved'}
                    </span>
                  </div>
                </fieldset>
              </form>
            ) : (
              <p>
                Settings are unavailable. Check local storage permissions and
                the diagnostic message above.
              </p>
            )}
          </>
        )}
        {view === 'About / Safety' && (
          <>
            <h1>About / Safety</h1>
            <p className="lead">
              Private by design. Always under your control.
            </p>
            <section>
              <h2>Jade Hypno Studio · 0.2.0</h2>
              <p>
                A local-first workspace for one adult to organise personalised
                audiovisual sessions. This is not a medical application or
                therapy service.
              </p>
              <p>
                This build only manages session structure and local data. It
                does not play hypnosis, generate scripts, connect to AI or voice
                services, or influence anyone.
              </p>
            </section>
            <section>
              <h2>Your data stays on this device</h2>
              <p>
                No accounts, telemetry, analytics, remote logging or cloud
                backend. Local records and exported JSON are not encrypted.
                Other people with access to your operating system account may be
                able to read them.
              </p>
              <p>
                Deletion retains the original in local Trash. Export sessions as
                JSON backups. Clearing app/browser data or uninstalling can
                remove sessions, settings and Trash.
              </p>
            </section>
            <section>
              <h2>Transparent boundaries</h2>
              <p>
                Only create material for your own informed, voluntary use.
                Future audiovisual features are not included here. Voice,
                caption and export preferences are stored placeholders.
              </p>
              <p>
                Autosave waits 600 ms after edits. Save before shutting down;
                force-quitting or losing power can lose edits that have not
                reached disk.
              </p>
            </section>
          </>
        )}
        {action && (
          <Modal>
            <h2 id="dialog-title">
              {action.type === 'delete'
                ? 'Move session to Trash?'
                : action.type === 'reopen'
                  ? 'Discard edits and reopen?'
                  : 'Rename session'}
            </h2>
            <p>{action.session.title}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (action.type === 'reopen') {
                    await writer.current?.cancelPendingAndWait();
                    openEditor(await repo.load(action.session.id));
                    setAction(null);
                    return;
                  }
                  if (action.type === 'delete') {
                    await repo.trash(
                      action.session.id,
                      action.session.updatedAt,
                    );
                    if (session?.id === action.session.id) {
                      writer.current?.dispose();
                      writer.current = null;
                      setSession(null);
                    }
                  } else {
                    const updated = await repo.save(
                      { ...action.session, title: rename.trim() },
                      action.session.updatedAt,
                    );
                    if (session?.id === updated.id) {
                      writer.current?.dispose();
                      writer.current = null;
                      setSession(null);
                    }
                  }
                  setAction(null);
                  await refresh();
                  setStatus(
                    action.type === 'delete'
                      ? 'Moved to Trash. The original session is retained for recovery.'
                      : 'Session renamed.',
                  );
                });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !busy) setAction(null);
              }}
            >
              <fieldset disabled={busy}>
                {action.type === 'rename' ? (
                  <label>
                    New title
                    <input
                      autoFocus
                      required
                      maxLength={200}
                      value={rename}
                      onChange={(event) => setRename(event.target.value)}
                    />
                  </label>
                ) : (
                  <p>
                    {action.type === 'reopen'
                      ? 'Unsaved edits will be discarded. Use Save as copy first if you want to keep them.'
                      : 'The original session stays in local Trash; this does not permanently delete it.'}
                  </p>
                )}
                <div className="actions">
                  <button
                    autoFocus={action.type === 'delete'}
                    type="button"
                    onClick={() => setAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className={action.type === 'delete' ? 'danger' : 'primary'}
                    disabled={action.type === 'rename' && !rename.trim()}
                  >
                    {action.type === 'delete'
                      ? 'Move to Trash'
                      : action.type === 'reopen'
                        ? 'Discard and reopen'
                        : 'Rename'}
                  </button>
                </div>
              </fieldset>
            </form>
          </Modal>
        )}
      </main>
    </div>
  );
}
