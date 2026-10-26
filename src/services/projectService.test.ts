import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const {
  createProject, deleteProject, getProjectSource, listProjects, saveProjectSource,
  saveWorkLanguages, listWorkspaceLanguageCodes,
  getDashboardOverviewStats, listProjectsNeedingAttention,
} = await import('./projectService');

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
      },
    ]);

    const result = await getProjectSource('proj-1');

    expect(result?.sourceFootnotes).toEqual(footnotes);
    expect(result?.markdownAware).toBe(true);
    expect(result?.documentFormat).toBe('markdown');
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
      },
      {
        source: { code: 'lat', variety: 'medieval', note: '' },
        target: { code: null, variety: null, note: ' modern register ' },
      },
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
      'lat',
      'medieval',
      '',
      '',
      null,
      'modern register',
      'proj-1',
    ]);
  });

  it('getProjectSource returns the work languages from the project columns', async () => {
    dbMocks.select.mockResolvedValueOnce([
      {
        source_display_text: 'x', source_processing_text: 'x', source_footnotes: '[]',
        document_format: 'plain', render_profile: 'plain-text', markdown_aware: 0, experimental_import: null,
        source_language: 'lat', source_language_variety: 'medieval', source_language_note: 'abbrev.',
        target_language: '', target_language_variety: null, target_language_note: '',
      },
    ]);

    const result = await getProjectSource('proj-1');

    expect(result?.workLanguages).toEqual({
      source: { code: 'lat', variety: 'medieval', note: 'abbrev.' },
      target: { code: null, variety: null, note: '' },
    });
  });

  it('saveWorkLanguages updates only the six language columns', async () => {
    await saveWorkLanguages('proj-1', {
      source: { code: 'lat', variety: null, note: '' },
      target: { code: 'ita', variety: null, note: '' },
    });

    const [query, params] = dbMocks.execute.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('UPDATE projects SET');
    expect(query).not.toContain('source_display_text');
    expect(params).toEqual(['lat', null, '', 'ita', null, '', 'proj-1']);
  });

  it('listWorkspaceLanguageCodes returns the non-empty codes used in the workspace', async () => {
    dbMocks.select.mockResolvedValueOnce([{ code: 'lat' }, { code: '' }, { code: null }, { code: 'ita' }]);

    await expect(listWorkspaceLanguageCodes('ws-1')).resolves.toEqual(['lat', 'ita']);
  });
});

describe('projectService — deleteProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.runInTransaction.mockImplementation(async (callback: (run: typeof dbMocks.execute) => Promise<void>) => callback(dbMocks.execute));
  });

  it('deletes project-scoped data before deleting the project row', async () => {
    await deleteProject('proj-1');
    expect(dbMocks.runInTransaction).toHaveBeenCalledOnce();

    expect(dbMocks.execute.mock.calls.map(([query]) => query)).toEqual([
      'DELETE FROM operation_logs WHERE project_id = $1',
      'DELETE FROM project_glossaries WHERE project_id = $1',
      'UPDATE phrase_memory SET project_id = NULL, chunk_id = NULL WHERE project_id = $1',
      'DELETE FROM translations WHERE project_id = $1',
      'DELETE FROM pipelines WHERE project_id = $1',
      'DELETE FROM projects WHERE id = $1',
    ]);
  });
});

const LANGUAGES = { source: { code: 'lat', variety: null, note: '' }, target: { code: 'ita', variety: null, note: '' } };

describe('projectService — explicit book origin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.runInTransaction.mockImplementation(async (callback: (run: typeof dbMocks.execute) => Promise<void>) => callback(dbMocks.execute));
  });
  it('creates the translation, pipeline and selected source version in one transaction', async () => {
    const id = await createProject('Fiore', LANGUAGES, 'ws-1', 'version-a');
    expect(dbMocks.runInTransaction).toHaveBeenCalledOnce();
    expect(dbMocks.execute).toHaveBeenCalledTimes(3);
    expect(dbMocks.execute.mock.calls[0][1]).toEqual([id, 'Fiore', 'ws-1', 'lat', null, '', 'ita', null, '']);
    expect(String(dbMocks.execute.mock.calls[1][0])).not.toContain('language');
    expect(dbMocks.execute.mock.calls[2]).toEqual([expect.stringContaining('INSERT INTO translation_origins'), [id, 'version-a']]);
  });
  it('does not infer a book when no version is selected', async () => {
    await createProject('Fiore.txt', LANGUAGES, 'ws-1');
    expect(dbMocks.execute).toHaveBeenCalledTimes(2);
    expect(dbMocks.execute.mock.calls.some(([query]) => String(query).includes('translation_origins'))).toBe(false);
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

describe('projectService — getDashboardOverviewStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines project count and chunk completion into one object', async () => {
    dbMocks.select
      .mockResolvedValueOnce([{ count: 7 }])
      .mockResolvedValueOnce([{ total: 42, completed: 30 }]);

    const result = await getDashboardOverviewStats();

    expect(result).toEqual({ totalProjects: 7, totalChunks: 42, completedChunks: 30 });
  });

  it('defaults to zero when there is no data yet', async () => {
    dbMocks.select
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ total: 0, completed: null }]);

    const result = await getDashboardOverviewStats();

    expect(result).toEqual({ totalProjects: 0, totalChunks: 0, completedChunks: 0 });
  });
});

describe('projectService — listProjectsNeedingAttention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries chunks with a poor/critical judge rating or open issues, grouped by project', async () => {
    dbMocks.select.mockResolvedValueOnce([
      { project_id: 'proj-1', project_name: 'Project A', workspace_id: 'ws-1', workspace_name: 'Alpha', issue_count: 3 },
    ]);

    const result = await listProjectsNeedingAttention(8);

    expect(dbMocks.select).toHaveBeenCalledWith(
      expect.stringContaining("judge_rating IN ('critical', 'poor')"),
      [8, null],
    );
    expect(result[0]).toMatchObject({ project_id: 'proj-1', issue_count: 3 });
  });
});
