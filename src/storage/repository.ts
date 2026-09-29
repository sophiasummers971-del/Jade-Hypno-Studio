import { z } from 'zod';
import type { ExperimentRecord } from '../experiment/model';
import {
  SessionSchema,
  type Session,
  type Settings,
  copySession,
} from '../domain/schema';
export const ListSchema = z.object({
  sessions: z.array(SessionSchema),
  issues: z.array(z.object({ file: z.string(), message: z.string() })),
});
export type SessionList = z.infer<typeof ListSchema>;
export interface SessionRepository {
  list(): Promise<SessionList>;
  load(id: string): Promise<Session>;
  save(session: Session, expectedUpdatedAt: string | null): Promise<Session>;
  trash(id: string, expectedUpdatedAt: string): Promise<void>;
}
export interface ExperimentRepository {
  listExperiments(sessionId?: string): Promise<ExperimentRecord[]>;
  saveExperiment(
    record: ExperimentRecord,
    expectedUpdatedAt: string | null,
  ): Promise<ExperimentRecord>;
  deleteExperiment(id: string, expectedUpdatedAt: string): Promise<void>;
}
export interface SettingsRepository {
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
}
export interface Repository
  extends SessionRepository, SettingsRepository, ExperimentRepository {}

export async function duplicateSession(
  repo: SessionRepository,
  session: Session,
) {
  return repo.save(copySession(session), null);
}
