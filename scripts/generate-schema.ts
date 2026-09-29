import { readFileSync, writeFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  SessionSchema,
  SettingsSchema,
  defaultSettings,
} from '../src/domain/schema';
function output(path: string, contents: string) {
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== contents)
      throw new Error(`Schema drift: ${path}. Run npm run schema:generate.`);
  } else writeFileSync(path, contents);
}
for (const [name, schema] of [
  ['session', SessionSchema],
  ['settings', SettingsSchema],
] as const) {
  output(
    `src-tauri/schemas/${name}.schema.json`,
    JSON.stringify(
      zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' }),
      null,
      2,
    ) + '\n',
  );
}
output(
  'src-tauri/schemas/default-settings.json',
  JSON.stringify(defaultSettings, null, 2) + '\n',
);
