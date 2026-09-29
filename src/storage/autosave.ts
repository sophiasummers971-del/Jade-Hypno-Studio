import type { Session } from '../domain/schema';
import type { SessionRepository } from './repository';
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
/** One ordered writer. A completion only acknowledges the revision actually written. */
export class Autosave {
  private pausing = false;
  private revision = 0;
  private savedRevision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private expected: string;
  private current: Session;
  constructor(
    private repo: SessionRepository,
    session: Session,
    private notify: (
      state: SaveState,
      session?: Session,
      error?: unknown,
    ) => void,
    private delay = 600,
  ) {
    this.current = session;
    this.expected = session.updatedAt;
  }
  get dirty() {
    return this.revision !== this.savedRevision;
  }
  get snapshot() {
    return this.current;
  }
  edit(session: Session) {
    this.current = session;
    this.revision++;
    this.notify('unsaved');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {
        /* Error is reported by drain. */
      });
    }, this.delay);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.dirty) await this.flush();
      return;
    }
    if (!this.dirty) return;
    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }
  private async drain() {
    while (this.dirty && !this.pausing) {
      const revision = this.revision;
      this.notify('saving');
      try {
        const saved = await this.repo.save(this.current, this.expected);
        this.expected = saved.updatedAt;
        this.savedRevision = revision;
        this.current = { ...this.current, updatedAt: saved.updatedAt };
        this.notify(this.dirty ? 'unsaved' : 'saved', this.current);
      } catch (error) {
        this.notify('error', undefined, error);
        throw error;
      }
    }
  }
  async cancelPendingAndWait(): Promise<void> {
    clearTimeout(this.timer);
    // An atomic write already in progress cannot be cancelled. Read disk only after it settles.
    this.pausing = true;
    try {
      await this.running;
    } catch {
      /* drain already surfaced the save error. */
    } finally {
      this.pausing = false;
    }
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
