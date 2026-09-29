import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SessionList } from '../storage/repository';
import type { Repository } from '../storage/repository';
import {
  ratingKeys,
  summarizeExperiments,
  type ExperimentRecord,
  type RatingKey,
} from '../experiment/model';

const labels: Record<RatingKey, string> = {
  absorption: 'Absorption',
  relaxation: 'Relaxation',
  focus: 'Focus',
  immersion: 'Immersion',
  distraction: 'Distraction',
  comfort: 'Comfort',
  enjoyment: 'Enjoyment',
};

export function ExperimentLab({
  repo,
  sessions,
  pending,
  onPendingHandled,
}: {
  repo: Repository;
  sessions: SessionList;
  pending?: ExperimentRecord | null;
  onPendingHandled?: () => void;
}) {
  const [records, setRecords] = useState<ExperimentRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<ExperimentRecord | null>(
    pending ?? null,
  );
  const [error, setError] = useState('');
  const refresh = useCallback(
    async () => setRecords(await repo.listExperiments()),
    [repo],
  );
  useEffect(() => {
    void refresh().catch((problem) => setError(String(problem)));
  }, [refresh]);
  useEffect(() => {
    if (pending) setEditing(pending);
  }, [pending]);
  const visible = useMemo(
    () => records.filter((record) => !filter || record.sessionId === filter),
    [records, filter],
  );
  const summary = useMemo(() => summarizeExperiments(visible), [visible]);
  const sessionIds = new Set(sessions.sessions.map((session) => session.id));

  const save = async () => {
    if (!editing) return;
    const existing = records.find((record) => record.id === editing.id);
    await repo.saveExperiment(editing, existing?.updatedAt ?? null);
    setEditing(null);
    onPendingHandled?.();
    await refresh();
  };

  return (
    <div className="experiment-lab">
      <div className="page-heading">
        <div>
          <h1>Personal Experiment Lab</h1>
          <p className="lead">
            Private observations about your own completed sessions. Ratings are
            descriptive notes, not medical or psychological measurements.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editing && (
        <section className="experiment-editor">
          <h2>Record Session Notes</h2>
          <p>
            Optional. Skip it whenever you want. Lower immersion or absorption
            is not a failure, including after Grounding Mode.
          </p>
          <div className="form-grid">
            <label>
              Experiment label
              <input
                maxLength={256}
                value={editing.label}
                onChange={(event) =>
                  setEditing({ ...editing, label: event.target.value })
                }
              />
            </label>
            <label>
              Completed
              <input
                value={new Date(editing.completedAt).toLocaleString()}
                readOnly
              />
            </label>
          </div>
          <div className="rating-grid">
            {ratingKeys.map((key) => (
              <label key={key}>
                {labels[key]}: {editing.ratings[key] ?? 'not rated'}
                <select
                  value={editing.ratings[key] ?? ''}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      ratings: {
                        ...editing.ratings,
                        [key]: event.target.value
                          ? Number(event.target.value)
                          : null,
                      },
                    })
                  }
                >
                  <option value="">Not rated</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            Notes
            <textarea
              rows={5}
              maxLength={10000}
              value={editing.notes}
              onChange={(event) =>
                setEditing({ ...editing, notes: event.target.value })
              }
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                void save().catch((problem) => setError(String(problem)))
              }
            >
              Save observation
            </button>
            <button
              onClick={() => {
                setEditing(null);
                onPendingHandled?.();
              }}
            >
              Skip / cancel
            </button>
          </div>
        </section>
      )}
      <section>
        <h2>History</h2>
        <label>
          Filter by session
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All sessions</option>
            {sessions.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </label>
        <p>
          {summary.count} recorded run{summary.count === 1 ? '' : 's'}.
        </p>
        {summary.count > 0 && (
          <div
            className="experiment-summary"
            aria-label="Subjective rating averages"
          >
            {ratingKeys.map((key) => (
              <div key={key}>
                <strong>{labels[key]}</strong>
                <span>{summary.averages[key]?.toFixed(1) ?? '—'} / 5</span>
                <small>
                  Earlier {summary.earlierAverages[key]?.toFixed(1) ?? '—'} ·
                  Recent {summary.recentAverages[key]?.toFixed(1) ?? '—'}
                </small>
              </div>
            ))}
          </div>
        )}
        <div className="experiment-history">
          {visible.map((record) => (
            <article key={record.id} className="history-row">
              <h3>{record.sessionTitle || 'Untitled session'}</h3>
              <p>
                {new Date(record.completedAt).toLocaleString()} ·{' '}
                {Math.round(record.durationSeconds / 60)} min
                {!sessionIds.has(record.sessionId) &&
                  ' · Original session no longer in active library'}
              </p>
              {record.label && (
                <p>
                  <strong>{record.label}</strong>
                </p>
              )}
              {record.notes && <p>{record.notes}</p>}
              <div className="actions">
                <button onClick={() => setEditing(record)}>Edit</button>
                <button
                  className="danger"
                  onClick={() =>
                    void repo
                      .deleteExperiment(record.id, record.updatedAt)
                      .then(refresh)
                      .catch((problem) => setError(String(problem)))
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!visible.length && <p>No observations recorded for this filter.</p>}
        </div>
      </section>
      <section>
        <h2>Privacy boundary</h2>
        <p>
          Experiment records stay in local app storage. The app does not rank
          sessions, infer susceptibility, diagnose anything, recommend
          intensity, or transmit observations.
        </p>
      </section>
    </div>
  );
}
