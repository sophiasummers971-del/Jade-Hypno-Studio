import { z } from 'zod';
import { randomId } from './uuid';

const id = z
  .string()
  .uuid()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const text = (max: number) => z.string().max(max);
const level = z.number().finite().min(0).max(1);
const duration = z.number().int().min(0).max(86400);
export const modes = ['standard', 'custom'] as const;
export const blockTypes = [
  'preflight',
  'arrival',
  'attention',
  'settling',
  'deepening',
  'main',
  'intensification',
  'release',
  'return',
  'exit',
  'custom',
] as const;
export const captionModes = [
  'full-narration',
  'selected-phrases',
  'emphasis-only',
  'none',
] as const;
export const transitionTypes = ['none', 'fade', 'crossfade'] as const;
export const backgroundTypes = [
  'none',
  'color',
  'gradient',
  'image',
  'video',
  'gif',
] as const;

export const VoiceSettingsSchema = z
  .object({
    voiceId: text(256),
    rate: z.number().finite().min(0.5).max(2),
    pitch: z.number().finite().min(-12).max(12),
    volume: level.default(1),
  })
  .strict();
export const AudioSettingsSchema = z
  .object({
    narrationLevel: level,
    musicReference: text(4096).default(''),
    ambientReference: text(4096).default(''),
    musicLevel: level,
    ambientLevel: level,
    effectsLevel: level.default(0.3),
    fadeInDuration: z.number().finite().min(0).max(300).default(0),
    fadeOutDuration: z.number().finite().min(0).max(300).default(0),
  })
  .strict();
export const resolutions = ['1280x720', '1920x1080', '3840x2160'] as const;
export const VisualSettingsSchema = z
  .object({
    resolution: z.enum(resolutions),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    mediaReference: text(4096).default(''),
    backgroundType: z.enum(backgroundTypes).default('color'),
    opacity: level.default(1),
    blur: z.number().finite().min(0).max(100).default(0),
    zoomAmount: z.number().finite().min(0).max(5).default(0),
    pulseAmount: z.number().finite().min(0).max(5).default(0),
    panAmount: z.number().finite().min(-20).max(20).default(0),
    brightness: z.number().finite().min(0.25).max(2).default(1),
    brightnessPulse: z.number().finite().min(0).max(1).default(0),
    fit: z.enum(['cover', 'contain', 'center']).default('cover'),
    gradient: text(512).default('linear-gradient(180deg, #101319, #202936)'),
    fixation: z.enum(['none', 'point', 'spiral']).default('none'),
    transitionType: z.enum(transitionTypes).default('none'),
  })
  .strict();
export const CaptionSettingsSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(captionModes).default('full-narration'),
    fontSize: z.number().int().min(8).max(200).default(32),
    alignment: z.enum(['left', 'center', 'right']).default('center'),
    position: z.enum(['top', 'middle', 'bottom']).default('bottom'),
    opacity: level.default(1),
    displayDuration: z.number().finite().min(0).max(300).default(0),
    fadeDuration: z.number().finite().min(0).max(10).default(0.25),
    selectedPhrases: z.array(text(500)).max(50).default([]),
  })
  .strict();
export const TransitionSettingsSchema = z
  .object({
    type: z.enum(transitionTypes),
    duration: z.number().finite().min(0).max(30),
  })
  .strict();
const ReviewSeveritySchema = z.enum(['info', 'warning', 'required-review']);
const FindingStatusSchema = z.enum([
  'unresolved',
  'reviewed',
  'dismissed',
  'edited',
]);
export const SafetyFindingSchema = z
  .object({
    id: text(512),
    ruleId: text(128),
    blockId: id,
    severity: ReviewSeveritySchema,
    category: text(128),
    matchedText: text(2000),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    status: FindingStatusSchema,
    note: text(5000).default(''),
    present: z.boolean().default(true),
  })
  .strict();
export const StructuralCheckSchema = z
  .object({
    id: text(128),
    label: text(256),
    severity: ReviewSeveritySchema,
    status: z.enum(['pass', 'missing']),
    explanation: text(2000),
  })
  .strict();
export const SafetyReviewSchema = z
  .object({
    status: z.enum(['not-reviewed', 'reviewed']),
    notes: text(10000),
    reviewedAt: z.string().datetime().nullable().default(null),
    lastScannedAt: z.string().datetime().nullable().default(null),
    scannerVersion: text(64).default(''),
    findings: z.array(SafetyFindingSchema).max(2000).default([]),
    structuralChecks: z.array(StructuralCheckSchema).max(100).default([]),
    reviewerAcknowledged: z.boolean().default(false),
    unresolvedCount: z.number().int().nonnegative().default(0),
  })
  .strict();
export const ExportSettingsSchema = z
  .object({
    directory: text(4096),
    resolution: z.enum(resolutions),
    captionsEnabled: z.boolean(),
  })
  .strict();
export const ExperimentMetadataSchema = z
  .object({ label: text(256), notes: text(10000) })
  .strict();
export const SessionBlockSchema = z
  .object({
    id,
    type: z.enum(blockTypes),
    title: text(200),
    enabled: z.boolean(),
    narration: text(100000),
    estimatedDuration: duration,
    manualDurationOverride: duration.nullable().default(null),
    voiceSettings: VoiceSettingsSchema,
    visualSettings: VisualSettingsSchema,
    audioSettings: AudioSettingsSchema,
    captionSettings: CaptionSettingsSchema,
    transitionSettings: TransitionSettingsSchema,
    notes: text(10000),
  })
  .strict();
export const SessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    title: text(200).min(1).regex(/\S/, 'Title cannot be blank'),
    description: text(10000),
    mode: z.enum(modes),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    durationEstimate: duration,
    blocks: z.array(SessionBlockSchema).max(200),
    sourceImports: z
      .array(
        z
          .object({
            id,
            fileName: text(512),
            originalText: text(1000000),
            importedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    audioSettings: AudioSettingsSchema,
    visualSettings: VisualSettingsSchema,
    safetyReview: SafetyReviewSchema,
    exportSettings: ExportSettingsSchema,
    experimentMetadata: ExperimentMetadataSchema,
  })
  .strict()
  .superRefine((session, context) => {
    if (Date.parse(session.updatedAt) < Date.parse(session.createdAt))
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'Updated timestamp precedes creation timestamp',
      });
    if (
      new Set(session.blocks.map((block) => block.id)).size !==
      session.blocks.length
    )
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'Block IDs must be unique',
      });
  });
export const SettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaultSessionDuration: z.number().int().min(1).max(1440),
    defaultVoiceId: text(256),
    defaultOutputResolution: z.enum(resolutions),
    defaultExportDirectory: text(4096),
    captionsEnabled: z.boolean(),
    defaultNarrationLevel: level,
    defaultMusicLevel: level,
    defaultAmbientLevel: level,
    wordsPerMinute: z.number().int().min(60).max(300).default(150),
  })
  .strict();
export type Session = z.infer<typeof SessionSchema>;
export type SessionBlock = z.infer<typeof SessionBlockSchema>;
export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>;
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;
export type VisualSettings = z.infer<typeof VisualSettingsSchema>;
export type CaptionSettings = z.infer<typeof CaptionSettingsSchema>;
export type TransitionSettings = z.infer<typeof TransitionSettingsSchema>;
export type SafetyFinding = z.infer<typeof SafetyFindingSchema>;
export type StructuralCheck = z.infer<typeof StructuralCheckSchema>;
export type SafetyReview = z.infer<typeof SafetyReviewSchema>;
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;
export type ExperimentMetadata = z.infer<typeof ExperimentMetadataSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export const defaultSettings: Settings = {
  schemaVersion: 1,
  defaultSessionDuration: 20,
  defaultVoiceId: '',
  defaultOutputResolution: '1920x1080',
  defaultExportDirectory: '',
  captionsEnabled: true,
  defaultNarrationLevel: 0.8,
  defaultMusicLevel: 0.3,
  defaultAmbientLevel: 0.2,
  wordsPerMinute: 150,
};
export function newSession(title: string, settings: Settings): Session {
  const now = new Date().toISOString();
  return SessionSchema.parse({
    schemaVersion: 1,
    id: randomId(),
    title: title.trim(),
    description: '',
    mode: 'standard',
    createdAt: now,
    updatedAt: now,
    durationEstimate: settings.defaultSessionDuration * 60,
    blocks: [],
    sourceImports: [],
    audioSettings: {
      narrationLevel: settings.defaultNarrationLevel,
      musicLevel: settings.defaultMusicLevel,
      ambientLevel: settings.defaultAmbientLevel,
    },
    visualSettings: {
      resolution: settings.defaultOutputResolution,
      backgroundColor: '#101319',
    },
    safetyReview: SafetyReviewSchema.parse({
      status: 'not-reviewed',
      notes: '',
    }),
    exportSettings: {
      directory: settings.defaultExportDirectory,
      resolution: settings.defaultOutputResolution,
      captionsEnabled: settings.captionsEnabled,
    },
    experimentMetadata: { label: '', notes: '' },
  });
}
export function copySession(session: Session): Session {
  const now = new Date().toISOString();
  return SessionSchema.parse({
    ...structuredClone(session),
    id: randomId(),
    title: `${session.title.slice(0, 193)} (copy)`,
    createdAt: now,
    updatedAt: now,
    safetyReview: SafetyReviewSchema.parse({
      status: 'not-reviewed',
      notes: '',
    }),
  });
}
export function parseSession(json: string): Session {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(
      'This file is not valid JSON. The original file has not been changed.',
    );
  }
  const result = SessionSchema.safeParse(data);
  if (!result.success)
    throw new Error(
      `Invalid session: ${result.error.issues.map((i) => `${i.path.join('.') || 'session'}: ${i.message}`).join('; ')}`,
    );
  return result.data;
}
