import { z } from 'zod';

/**
 * Le tabelle che il backup porta con sé, **in ordine di dipendenza**: i padri
 * prima dei figli.
 *
 * Ci sta tutto quello che non si riscarica (D31): schede delle opere, note,
 * trascrizioni, traduzioni con il loro storico, glossari, memoria di frasi, e
 * il registro del lavoro svolto. **Non** ci stanno le immagini, che si
 * riprendono dalla biblioteca, né le righe che le descrivono: dopo un
 * ripristino quei file non esistono, e dichiararli presenti sarebbe una bugia.
 */
export const BACKUP_TABLES = [
  'workspaces',
  'glossaries',
  'projects',
  'app_settings',
  'prompt_templates',
  'pipelines',
  'project_glossaries',
  'glossary_entries',
  'sources',
  'source_versions',
  'workspace_items',
  'glossary_entry_overrides',
  'transcription_documents',
  'transcription_segments',
  'transcription_revisions',
  'translation_origins',
  'translations',
  'translation_revisions',
  'provenance_events',
  'derived_metrics',
  'network_profiles',
  'library_network_profiles',
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

/**
 * Le opere che erano scaricate quando il backup è stato fatto, con la misura
 * usata (D31). Le immagini non ci sono: questo elenco è ciò che permette al
 * ripristino di proporre «riscarico le dodici opere che avevi?».
 */
const downloadedSourceSchema = z.object({
  versionId: z.string(),
  sourceTitle: z.string(),
  providerKey: z.string().nullable(),
  manifestUrl: z.string().nullable(),
  sizeTag: z.string().nullable(),
  pages: z.number().int().nonnegative(),
});

export type DownloadedSource = z.infer<typeof downloadedSourceSchema>;

export const backupPayloadSchema = z.object({
  glossa_version: z.string().trim().min(1),
  schema_version: z.number().int().nonnegative(),
  exported_at: z.string().datetime({ offset: true }),
  tables: z.object(backupTablesShape).passthrough(),
  // Assente nei backup fatti prima: non è un errore, vuol dire soltanto che
  // non c'è niente da proporre.
  downloaded: z.array(downloadedSourceSchema).optional(),
});

export type BackupPayload = z.infer<typeof backupPayloadSchema>;

export const advancedOptionsSchema = z.record(z.string(), z.unknown());

export const customProviderProfileSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  requiresApiKey: z.boolean(),
});

export type CustomProviderProfileInput = z.infer<typeof customProviderProfileSchema>;
