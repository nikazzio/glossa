import { describe, expect, it } from 'vitest';
import {
  advancedOptionsSchema,
  backupPayloadSchema,
  customProviderProfileSchema,
} from './externalData';
import type { BackupPayload } from './externalData';

function validBackup(): BackupPayload {
  return {
    glossa_version: '1.2.1',
    schema_version: 1,
    exported_at: '2026-07-21T12:00:00.000Z',
    tables: {
      workspaces: [],
      glossaries: [],
      projects: [],
      app_settings: [],
      prompt_templates: [],
      pipelines: [],
      project_glossaries: [],
      glossary_entries: [],
      translations: [],
      phrase_memory: [],
      source_phrase_embeddings: [],
    },
  };
}

describe('external data validation', () => {
it('accepts a backup containing BLOB columns encoded as byte arrays', () => {
  const backup = validBackup();
  backup.tables.phrase_memory.push({
    id: 'pm-1',
    embedding: [0, 32, 169, 255],
  });

  expect(backupPayloadSchema.safeParse(backup).success).toBe(true);
});

  it('rejects a backup with a missing table or a non-database value', () => {
    const missingTable = validBackup();
    delete (missingTable.tables as Partial<typeof missingTable.tables>).projects;
    const backup = validBackup();
    const invalidValue = {
      ...backup,
      tables: {
        ...backup.tables,
        workspaces: [{ id: 'workspace-1', nested: { invalid: true } }],
      },
    };

    expect(backupPayloadSchema.safeParse(missingTable).success).toBe(false);
    expect(backupPayloadSchema.safeParse(invalidValue).success).toBe(false);
  });

  it('accepts only JSON objects as advanced provider options', () => {
    expect(advancedOptionsSchema.safeParse({ num_ctx: 8192 }).success).toBe(true);
    expect(advancedOptionsSchema.safeParse(['num_ctx']).success).toBe(false);
    expect(advancedOptionsSchema.safeParse(null).success).toBe(false);
  });

  it('normalizes a complete custom provider profile and rejects malformed addresses', () => {
    const validProfile = customProviderProfileSchema.safeParse({
      name: '  OpenRouter  ',
      baseUrl: ' https://openrouter.ai/api/v1 ',
      requiresApiKey: true,
    });

    expect(validProfile).toMatchObject({
      success: true,
      data: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    });
    expect(customProviderProfileSchema.safeParse({
      name: 'OpenRouter',
      baseUrl: 'not an address',
      requiresApiKey: true,
    }).success).toBe(false);
  });
});
