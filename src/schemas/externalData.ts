import { z } from 'zod';

/**
 * Le tabelle che il backup porta con sé, **in ordine di dipendenza**: i padri
 * prima dei figli.
 *
 * Ci sta tutto quello che non si riscarica: schede delle opere, note,
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
  'custom_providers',
  'pipelines',
  'annotations',
  'project_glossaries',
  'glossary_entries',
  'sources',
  'source_field_overrides',
  'source_collections',
  'source_collection_items',
  'library_saved_views',
  'source_versions',
  'source_pages',
  'workspace_items',
  'glossary_entry_overrides',
  'transcription_documents',
  'transcription_segments',
  'transcription_revisions',
  'translation_origins',
  'translations',
  'translation_revisions',
  'operation_logs',
  'provenance_events',
  'derived_metrics',
  'network_profiles',
  'library_network_profiles',
  'library_size_policies',
  'text_units',
  'text_unit_revisions',
  'text_embeddings',
  'text_unit_tags',
  'phrase_memory',
  'jobs',
  'search_runs',
  'search_executions',
  'search_pages',
  'artifacts',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

const backupBlobSchema = z.array(z.number().int().min(0).max(255));
const backupValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), backupBlobSchema]);
const backupRowSchema = z.record(z.string(), backupValueSchema);
const backupTableSchema = z.array(backupRowSchema);

const backupTablesShape = Object.fromEntries(
  BACKUP_TABLES.map((table) => [table, backupTableSchema]),
) as Record<BackupTable, typeof backupTableSchema>;

const corpusTablesSchema = z.object(backupTablesShape).passthrough().superRefine((tables, ctx) => {
  const required: Record<string, string[]> = {
    text_units: ['id', 'provenance'],
    text_unit_revisions: ['id', 'unit_id', 'role', 'language', 'text', 'content_hash'],
    text_embeddings: ['revision_id', 'provider', 'model', 'profile'],
    text_unit_tags: ['unit_id', 'name'],
    phrase_memory: ['id', 'unit_id', 'source_revision_id', 'target_revision_id'],
  };
  for (const [table, fields] of Object.entries(required)) {
    const rows = tables[table as BackupTable];
    rows.forEach((row, index) => {
      const invalid = fields.find((field) => typeof row[field] !== 'string' || !String(row[field]).trim());
      if (invalid) ctx.addIssue({ code: 'custom', path: [table, index, invalid], message: 'Required corpus metadata is missing' });
      if (table !== 'text_embeddings') return;
      const dimensions = row.dimensions;
      const bytes = row.embedding;
      if (typeof dimensions !== 'number' || !Number.isInteger(dimensions) || dimensions <= 0
        || !Array.isArray(bytes) || bytes.length !== dimensions * 4) {
        ctx.addIssue({ code: 'custom', path: [table, index], message: 'Invalid embedding dimensions or bytes' });
        return;
      }
      const view = new DataView(Uint8Array.from(bytes).buffer);
      let nonzero = false;
      for (let offset = 0; offset < bytes.length; offset += 4) {
        const value = view.getFloat32(offset, true);
        if (!Number.isFinite(value)) {
          ctx.addIssue({ code: 'custom', path: [table, index, 'embedding'], message: 'Non-finite embedding value' });
          return;
        }
        nonzero ||= value !== 0;
      }
      if (!nonzero) ctx.addIssue({ code: 'custom', path: [table, index, 'embedding'], message: 'Zero embedding is invalid' });
    });
  }
});

/** Una cartella di misura che c'era, con quante pagine conteneva. */
const downloadedSizeSchema = z.object({
  sizeTag: z.string(),
  pages: z.number().int().nonnegative(),
});

/**
 * Le opere che erano scaricate quando il backup è stato fatto, con **tutte** le
 * misure che avevano. Le immagini non ci sono: questo elenco è ciò che
 * permette al ripristino di proporre «riscarico le dodici opere che avevi?».
 *
 * Le misure sono più di una perché lo sono nel deposito: un libro può essere
 * completo a 2000 e avere tre pagine prese a piena risoluzione di proposito
 *. Registrarne una sola le faceva sparire dal ripristino senza dirlo.
 */
const downloadedSourceSchema = z.object({
  versionId: z.string(),
  sourceTitle: z.string(),
  providerKey: z.string().nullable(),
  manifestUrl: z.string().nullable(),
  /** La misura con cui il libro era stato scaricato: quella con più pagine. */
  principalSize: z.string().nullable(),
  sizes: z.array(downloadedSizeSchema),
});

export const downloadedSourcesSchema = z.array(downloadedSourceSchema);

export type DownloadedSize = z.infer<typeof downloadedSizeSchema>;
export type DownloadedSource = z.infer<typeof downloadedSourceSchema>;

export const backupPayloadSchema = z.object({
  glossa_version: z.string().trim().min(1),
  schema_version: z.number().int().nonnegative(),
  exported_at: z.string().datetime({ offset: true }),
  tables: corpusTablesSchema,
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
