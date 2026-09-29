import { z } from 'zod';
import { ExperimentRecordSchema, type ExperimentRecord } from './model';
import type { ExperimentRepository } from '../storage/repository';

const ExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('jade-experiment-records'),
    records: z.array(ExperimentRecordSchema).max(10000),
  })
  .strict();

export function exportExperimentsJson(records: ExperimentRecord[]): string {
  return JSON.stringify(
    ExportSchema.parse({ schemaVersion: 1, kind: 'jade-experiment-records', records }),
    null,
    2,
  ) + '\n';
}

export async function importExperimentsJson(
  repo: ExperimentRepository,
  json: string,
): Promise<number> {
  const parsed = ExportSchema.parse(JSON.parse(json));
  let imported = 0;
  for (const record of parsed.records) {
    await repo.saveExperiment(record, null);
    imported += 1;
  }
  return imported;
}
