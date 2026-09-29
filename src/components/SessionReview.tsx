import { useState } from 'react';
import type { SafetyFinding, Session } from '../domain/schema';
import {
  canCompleteReview,
  completeReview,
  scanSession,
  updateFinding,
} from '../safety/reviewEngine';
import { ruleById } from '../safety/rules';

function contextFor(session: Session, finding: SafetyFinding): string {
  const block = session.blocks.find((item) => item.id === finding.blockId);
  if (!block) return finding.matchedText;
  const start = Math.max(0, finding.startOffset - 60);
  const end = Math.min(block.narration.length, finding.endOffset + 60);
  return `${start > 0 ? '…' : ''}${block.narration.slice(start, end)}${end < block.narration.length ? '…' : ''}`;
}

export function SessionReview({
  session,
  onChange,
  onReturnEditor,
  onJumpToBlock,
  onGrounding,
}: {
  session: Session;
  onChange: (session: Session) => void;
  onReturnEditor: () => void;
  onJumpToBlock: (blockId: string) => void;
  onGrounding: () => void;
}) {
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>(
    {},
  );
  const [awake, setAwake] = useState<boolean | null>(null);
  const [stable, setStable] = useState<boolean | null>(null);
  const [voluntary, setVoluntary] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const review = session.safetyReview;
  const findings = review.findings.filter((finding) => finding.present);
  const history = review.findings.filter((finding) => !finding.present);
  const disoriented = awake === false || stable === false;

  const replaceReview = (next: Session['safetyReview']) =>
    onChange({ ...session, safetyReview: next });

  return (
    <div className="review-view">
      <div className="page-heading">
        <div>
          <h1>Session Review</h1>
          <p className="lead">
            Detect, highlight, explain and require review before future
            rendering. This scanner is local, rules-based, and not a medical
            safety guarantee.
          </p>
        </div>
        <span
          className={
            review.reviewerAcknowledged ? 'badge review-complete' : 'badge'
          }
        >
          {review.reviewerAcknowledged
            ? 'REVIEW COMPLETE'
            : 'ISSUES REQUIRE ATTENTION'}
        </span>
      </div>

      <section className="review-summary">
        <dl>
          <dt>Last scanned</dt>
          <dd>
            {review.lastScannedAt
              ? new Date(review.lastScannedAt).toLocaleString()
              : 'Not scanned yet'}
          </dd>
          <dt>Scanner version</dt>
          <dd>{review.scannerVersion || 'Not scanned yet'}</dd>
          <dt>Unresolved</dt>
          <dd>{review.unresolvedCount}</dd>
        </dl>
        <p className="hint">
          Keyword and pattern matching can produce false positives. Findings are
          prompts for human review, not automatic bans.
        </p>
      </section>

      <section>
        <h2>Preflight check</h2>
        <p>
          This is a simple application state check for future immersive
          playback. It is not a diagnosis.
        </p>
        <fieldset className="preflight-grid">
          <legend className="sr-only">Preflight state</legend>
          <div className="preflight-item">
            <strong>I am awake and oriented.</strong>
            <div className="actions">
              <button
                type="button"
                aria-pressed={awake === true}
                onClick={() => setAwake(true)}
              >
                Yes
              </button>
              <button
                type="button"
                aria-pressed={awake === false}
                onClick={() => setAwake(false)}
              >
                Not right now
              </button>
            </div>
          </div>
          <div className="preflight-item">
            <strong>Reality feels ordinary and stable.</strong>
            <div className="actions">
              <button
                type="button"
                aria-pressed={stable === true}
                onClick={() => setStable(true)}
              >
                Yes
              </button>
              <button
                type="button"
                aria-pressed={stable === false}
                onClick={() => setStable(false)}
              >
                Not right now
              </button>
            </div>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={voluntary}
              onChange={(event) => setVoluntary(event.target.checked)}
            />
            I am choosing to run this session voluntarily.
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={canStop}
              onChange={(event) => setCanStop(event.target.checked)}
            />
            I understand that I can stop the session immediately.
          </label>
        </fieldset>
        {disoriented && (
          <div className="grounding-callout" role="status">
            <strong>
              Immersive playback should not be the next step from this state.
            </strong>
            <p>
              Use the ordinary Calm / Grounding screen instead. No medical
              conclusion is being made.
            </p>
            <button type="button" className="primary" onClick={onGrounding}>
              Calm / Grounding Mode
            </button>
          </div>
        )}
        {!disoriented &&
          awake === true &&
          stable === true &&
          voluntary &&
          canStop && (
            <p className="notice">
              Preflight confirmations are complete for this app visit.
            </p>
          )}
      </section>

      <section>
        <h2>Structural checks</h2>
        <div className="structural-list">
          {review.structuralChecks.length === 0 && (
            <p>Rescan to run structural checks.</p>
          )}
          {review.structuralChecks.map((check) => (
            <article
              className={`structural-row severity-${check.severity}`}
              key={check.id}
            >
              <strong>
                {check.status === 'pass' ? '✓' : '⚠'} {check.label}
              </strong>
              <span>{check.status === 'pass' ? 'Present' : 'Missing'}</span>
              {check.status === 'missing' && <p>{check.explanation}</p>}
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Content findings</h2>
        {findings.length === 0 ? (
          <p>
            No current rule matches. This does not guarantee psychological or
            physical safety.
          </p>
        ) : (
          <div className="finding-list">
            {findings.map((finding) => {
              const block = session.blocks.find(
                (item) => item.id === finding.blockId,
              );
              const rule = ruleById.get(finding.ruleId);
              const reason = dismissReasons[finding.id] ?? '';
              return (
                <article
                  className={`finding-card severity-${finding.severity}`}
                  key={finding.id}
                >
                  <div className="finding-heading">
                    <strong>{block?.title ?? 'Unknown block'}</strong>
                    <span className="badge">
                      {finding.severity.toUpperCase()}
                    </span>
                  </div>
                  <dl>
                    <dt>Category</dt>
                    <dd>{finding.category}</dd>
                    <dt>Matched text</dt>
                    <dd>
                      <mark>{finding.matchedText}</mark>
                    </dd>
                    <dt>Status</dt>
                    <dd>{finding.status}</dd>
                  </dl>
                  <p className="context">
                    <strong>Context:</strong> {contextFor(session, finding)}
                  </p>
                  {rule && (
                    <>
                      <p>
                        <strong>Why flagged:</strong> {rule.explanation}
                      </p>
                      <p>
                        <strong>Review guidance:</strong> {rule.remediation}
                      </p>
                    </>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => onJumpToBlock(finding.blockId)}
                    >
                      Jump to text
                    </button>
                    <button
                      type="button"
                      disabled={finding.status === 'reviewed'}
                      onClick={() =>
                        replaceReview(
                          updateFinding(review, finding.id, 'reviewed'),
                        )
                      }
                    >
                      Mark reviewed
                    </button>
                  </div>
                  <label>
                    Dismissal reason
                    <input
                      value={reason}
                      maxLength={5000}
                      placeholder="Required to dismiss this finding"
                      onChange={(event) =>
                        setDismissReasons({
                          ...dismissReasons,
                          [finding.id]: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!reason.trim() || finding.status === 'dismissed'}
                    onClick={() =>
                      replaceReview(
                        updateFinding(review, finding.id, 'dismissed', reason),
                      )
                    }
                  >
                    Dismiss with reason
                  </button>
                  {finding.note && (
                    <p className="hint">Audit note: {finding.note}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2>Audit history</h2>
          <p>
            Older findings remain visible even when content was edited or a
            finding was dismissed.
          </p>
          {history.map((finding) => (
            <article className="history-row" key={finding.id}>
              <strong>{finding.category}</strong>
              <span>{finding.status}</span>
              <p>Previously matched: “{finding.matchedText}”</p>
              {finding.note && <p>Note: {finding.note}</p>}
            </article>
          ))}
        </section>
      )}

      <div className="actions review-actions">
        <button
          type="button"
          onClick={() => replaceReview(scanSession(session, review))}
        >
          Rescan
        </button>
        <button type="button" onClick={onReturnEditor}>
          Return to Editor
        </button>
        <button
          className="primary"
          type="button"
          disabled={!canCompleteReview(review)}
          onClick={() => replaceReview(completeReview(review))}
        >
          Review Complete
        </button>
      </div>
    </div>
  );
}
