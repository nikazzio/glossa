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

const backupBlobSchema = z.array(z.number().int().min(0).max(255));
const backupValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), backupBlobSchema]);
const backupRowSchema = z.record(z.string(), backupValueSchema);
const backupTableSchema = z.array(backupRowSchema);

const backupTablesShape = Object.fromEntries(
  BACKUP_TABLES.map((table) => [table, backupTableSchema]),
) as Record<BackupTable, typeof backupTableSchema>;

export const backupPayloadSchema = z.object({
  glossa_version: z.string().trim().min(1),
  schema_version: z.number().int().nonnegative(),
  exported_at: z.string().datetime({ offset: true }),
  tables: z.object(backupTablesShape).passthrough(),
});

export type BackupPayload = z.infer<typeof backupPayloadSchema>;

export const advancedOptionsSchema = z.record(z.string(), z.unknown());

export const customProviderProfileSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  requiresApiKey: z.boolean(),
});

export type CustomProviderProfileInput = z.infer<typeof customProviderProfileSchema>;
