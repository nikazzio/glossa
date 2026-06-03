import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const { deleteProject, getProjectSource, listProjects, saveProjectSource } = await import('./projectService');

describe('projectService — source text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the project does not exist', async () => {
    dbMocks.select.mockResolvedValueOnce([]);

    const result = await getProjectSource('proj-missing');

    expect(result).toBeNull();
  });

  it('returns defaults when optional columns are null', async () => {
    dbMocks.select.mockResolvedValueOnce([
      {
        source_display_text: null,
        source_processing_text: null,
        source_footnotes: null,
        document_format: null,
        render_profile: null,
        markdown_aware: null,
        experimental_import: null,
        view_mode: null,
      },
    ]);

    const result = await getProjectSource('proj-1');

    expect(result).not.toBeNull();
    expect(result?.sourceDisplayText).toBe('');
    expect(result?.sourceProcessingText).toBe('');
    expect(result?.sourceFootnotes).toEqual([]);
    expect(result?.documentFormat).toBe('plain');
    expect(result?.renderProfile).toBe('plain-text');
    expect(result?.markdownAware).toBe(false);
    expect(result?.experimentalImport).toBeNull();
  });

  it('parses source footnotes JSON correctly', async () => {
    const footnotes = [{ id: 'fn-1', marker: '*', content: 'A note' }];
    dbMocks.select.mockResolvedValueOnce([
      {
        source_display_text: 'Hello',
        source_processing_text: 'Hello',
        source_footnotes: JSON.stringify(footnotes),
        document_format: 'markdown',
        render_profile: 'markdown',
        markdown_aware: 1,
        experimental_import: 'docx-markdown',
        view_mode: 'document',
      },
    ]);

    const result = await getProjectSource('proj-1');

    expect(result?.sourceFootnotes).toEqual(footnotes);
    expect(result?.markdownAware).toBe(true);
    expect(result?.documentFormat).toBe('markdown');
    expect(result?.viewMode).toBe('document');
  });

  it('returns empty footnotes array when stored JSON is corrupted', async () => {
    dbMocks.select.mockResolvedValueOnce([
      {
        source_display_text: '',
        source_processing_text: '',
        source_footnotes: '{{not valid json}}',
        document_format: 'plain',
        render_profile: 'plain-text',
        markdown_aware: 0,
        experimental_import: null,
        view_mode: null,
      },
    ]);

    const result = await getProjectSource('proj-1');

    expect(result?.sourceFootnotes).toEqual([]);
  });

  it('saveProjectSource writes all columns with correct values', async () => {
    await saveProjectSource(
      'proj-1',
      'Display text',
      'Processing text',
      [],
      {
        documentFormat: 'markdown',
        renderProfile: 'markdown',
        markdownAware: true,
        experimentalImport: 'docx-markdown',
        sourceLanguage: 'Latin',
        targetLanguage: 'English',
      },
      'document',
    );

    expect(dbMocks.execute).toHaveBeenCalledOnce();
    const [query, params] = dbMocks.execute.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('UPDATE projects SET');
    expect(params).toEqual([
      'Display text',
      'Processing text',
      '[]',
      'markdown',
      'markdown',
      1,
      'docx-markdown',
      'Latin',
      'English',
      'document',
      'proj-1',
    ]);
  });
});

describe('projectService — deleteProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
  });

  it('deletes project-scoped data before deleting the project row', async () => {
    await deleteProject('proj-1');

    expect(dbMocks.execute.mock.calls.map(([query]) => query)).toEqual([
      'DELETE FROM operation_logs WHERE project_id = $1',
      'DELETE FROM project_glossaries WHERE project_id = $1',
      'DELETE FROM source_phrase_embeddings WHERE project_id = $1',
      'UPDATE phrase_memory SET project_id = NULL, chunk_id = NULL WHERE project_id = $1',
      'DELETE FROM translations WHERE project_id = $1',
      'DELETE FROM pipelines WHERE project_id = $1',
      'DELETE FROM projects WHERE id = $1',
    ]);
  });
});

describe('projectService — listProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns projects with pipeline metadata for the workspace', async () => {
    dbMocks.select.mockResolvedValueOnce([
      {
        id: 'proj-1',
        name: 'Project A',
        source_language: 'English',
        target_language: 'Italian',
        view_mode: 'document',
        created_at: '2026-06-03T00:00:00.000Z',
        updated_at: '2026-06-03T00:00:00.000Z',
        pipeline_count: 2,
        pipeline_names: 'Default · Editorial',
      },
    ]);

    const result = await listProjects('ws-1');

    expect(dbMocks.select).toHaveBeenCalledWith(
      expect.stringContaining('GROUP_CONCAT(pi.name,'),
      ['ws-1'],
    );
    expect(result[0]).toMatchObject({
      id: 'proj-1',
      pipeline_count: 2,
      pipeline_names: 'Default · Editorial',
    });
  });
});
