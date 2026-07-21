import { z } from 'zod';

export const BACKUP_TABLES = [
  'workspaces',
  'glossaries',
  'projects',
  'app_settings',
  'prompt_templates',
  'pipelines',
  'project_glossaries',
  'glossary_entries',
  'translations',
  'phrase_memory',
  'source_phrase_embeddings',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

const backupValueSchema = z.union([z.string(), z.number(), z.null()]);
const backupRowSchema = z.record(z.string(), backupValueSchema);
const backupTableSchema = z.array(backupRowSchema);

export const backupPayloadSchema = z.object({
  glossa_version: z.string().trim().min(1),
  schema_version: z.number().int().nonnegative(),
  exported_at: z.string().datetime({ offset: true }),
  tables: z.object({
    workspaces: backupTableSchema,
    glossaries: backupTableSchema,
    projects: backupTableSchema,
    app_settings: backupTableSchema,
    prompt_templates: backupTableSchema,
    pipelines: backupTableSchema,
    project_glossaries: backupTableSchema,
    glossary_entries: backupTableSchema,
    translations: backupTableSchema,
    phrase_memory: backupTableSchema,
    source_phrase_embeddings: backupTableSchema,
  }).passthrough(),
});

export type BackupPayload = z.infer<typeof backupPayloadSchema>;

export const advancedOptionsSchema = z.record(z.string(), z.unknown());

export const customProviderProfileSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  requiresApiKey: z.boolean(),
});

export type CustomProviderProfileInput = z.infer<typeof customProviderProfileSchema>;
