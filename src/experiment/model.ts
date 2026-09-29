import { z } from 'zod';
import { randomId } from '../domain/uuid';

const id = z.string().uuid();
export const ratingKeys = [
  'absorption',
  'relaxation',
  'focus',
  'immersion',
  'distraction',
  'comfort',
  'enjoyment',
] as const;
const rating = z.number().int().min(1).max(5).nullable();
export const ExperimentRatingsSchema = z
  .object(Object.fromEntries(ratingKeys.map((key) => [key, rating])) as Record<(typeof ratingKeys)[number], typeof rating>)
  .strict();
export const ExperimentRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    sessionId: id,
    sessionTitle: z.string().max(200),
    sessionRevision: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationSeconds: z.number().int().min(0).max(86400),
    label: z.string().max(256),
    notes: z.string().max(10000),
    ratings: ExperimentRatingsSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ExperimentRecord = z.infer<typeof ExperimentRecordSchema>;
export type ExperimentRatings = z.infer<typeof ExperimentRatingsSchema>;
export type RatingKey = (typeof ratingKeys)[number];

export function emptyRatings(): ExperimentRatings {
  return Object.fromEntries(ratingKeys.map((key) => [key, null])) as ExperimentRatings;
}

export function newExperimentRecord(input: {
  sessionId: string;
  sessionTitle: string;
  sessionRevision: string;
  completedAt: string;
  durationSeconds: number;
}): ExperimentRecord {
  const now = new Date().toISOString();
  return ExperimentRecordSchema.parse({
    schemaVersion: 1,
    id: randomId(),
    sessionId: input.sessionId,
    sessionTitle: input.sessionTitle,
    sessionRevision: input.sessionRevision,
    completedAt: input.completedAt,
    durationSeconds: input.durationSeconds,
    label: '',
    notes: '',
    ratings: emptyRatings(),
    createdAt: now,
    updatedAt: now,
  });
}

export type ExperimentSummary = {
  count: number;
  averages: Partial<Record<RatingKey, number>>;
  recentAverages: Partial<Record<RatingKey, number>>;
  earlierAverages: Partial<Record<RatingKey, number>>;
};

function averages(records: ExperimentRecord[]) {
  const result: Partial<Record<RatingKey, number>> = {};
  for (const key of ratingKeys) {
    const values = records
      .map((record) => record.ratings[key])
      .filter((value): value is number => value !== null);
    if (values.length)
      result[key] = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return result;
}

export function summarizeExperiments(records: ExperimentRecord[]): ExperimentSummary {
  const ordered = [...records].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const split = Math.ceil(ordered.length / 2);
  return {
    count: ordered.length,
    averages: averages(ordered),
    earlierAverages: averages(ordered.slice(0, split)),
    recentAverages: averages(ordered.slice(split)),
  };
}
