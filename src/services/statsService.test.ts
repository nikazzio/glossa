import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: DatabaseSync;
vi.mock('./dbService', () => ({
  select: vi.fn(async (sql: string, params: SQLInputValue[] = []) => {
    const statement = db.prepare(sql);
    return params.length ? statement.all(Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value]))) : statement.all();
  }),
}));
import { select } from './dbService';
import { loadActivity, loadChunkWords, loadFailedJobCount, loadMonthSummary, loadOcrCorrections, loadRemainingChunks, loadUsageRows } from './statsService';
import { loadPipelineEstimateConfigs } from './pipelineService';
import { chunkCosts, summarizeModels } from '../utils/dashboardStats';

const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);
function log(id: string, at: string, overrides: Record<string, SQLInputValue> = {}) {
  const fields = { id, at, project_id: 'p1', pipeline_id: 'pi1', chunk_id: 'c1', stage_id: 's', scope: 'stage', phase: 'end', level: 'success', message: '', provider: 'openai', model: 'model-a', input_tokens: 100, output_tokens: 10, cost_usd: 0.1, ...overrides };
  run(`INSERT INTO operation_logs (${Object.keys(fields).join(',')}) VALUES (${Object.keys(fields).map(() => '?').join(',')})`, ...Object.values(fields));
}
function revision(number: number, by: string, at: string) {
  run('INSERT INTO transcription_revisions (id, segment_id, revision_number, text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', `r${number}`, 's1', number, by === 'ocr' ? 'testo OCR' : 'testo corretto', by, at);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const file of readdirSync('src-tauri/migrations').filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(`src-tauri/migrations/${file}`, 'utf8'));
  }
  db.exec(`INSERT INTO workspaces (id, name, created_at) VALUES ('w1','One','2026-01-01'), ('w2','Two','2026-01-01');
    INSERT INTO projects (id, name, workspace_id) VALUES ('p1','One','w1'), ('p2','Two','w2');
    INSERT INTO pipelines (id, project_id, name, created_at) VALUES ('pi1','p1','First','2026-01-01'), ('pi2','p2','First','2026-01-01'), ('pi-later','p1','Later','2026-02-01');
    INSERT INTO translations (id, project_id, pipeline_id, chunk_status, translation_display_text, source_display_text)
      VALUES ('c1','p1','pi1','completed','one two','uno due'), ('c-old','p1','pi1','completed','old words','vecchio'),
        ('c2','p2','pi2','completed','other workspace','altro'), ('pending','p1','pi1','ready','','da fare'),
        ('pending-other','p2','pi2','ready','','altro'), ('pending-later','p1','pi-later','ready','','escluso');
    INSERT INTO transcription_documents (id, workspace_id, title) VALUES ('d1','w1','Document');
    INSERT INTO transcription_segments (id, document_id, position) VALUES ('s1','d1',0);`);
  vi.mocked(select).mockClear();
});
afterEach(() => db.close());

describe('statistics database contracts', () => {
  it('scopes eligible fragments by period and workspace, keeping their complete recorded costs', async () => {
    log('old-stage', '2026-09-01T12:00:00Z');
    log('new-stage', '2026-10-02T12:00:00Z');
    log('old-only', '2026-09-01T12:00:00Z', { chunk_id: 'c-old' });
    log('other-workspace', '2026-10-02T12:00:00Z', { project_id: 'p2', pipeline_id: 'pi2', chunk_id: 'c2' });
    log('failed-only', '2026-10-03T12:00:00Z', { chunk_id: 'c-old', level: 'error', input_tokens: null, output_tokens: null });
    const words = await loadChunkWords('w1', '2026-10-01T00:00:00Z');
    expect(words).toEqual([{ id: 'c1', words: 2 }]);
    const usage = await loadUsageRows('w1', null);
    expect(usage).toHaveLength(4);
    expect(chunkCosts(usage, {}).get('c1')).toBeCloseTo(0.2);
    expect(await loadUsageRows('w2', '2026-10-01T00:00:00Z')).toHaveLength(1);
  });

  it('attributes legacy retries to the nearest preceding start of the same pipeline and stage', async () => {
    const empty = { model: null, provider: null, input_tokens: null, output_tokens: null, cost_usd: null };
    log('start', '2026-10-02T12:00:00Z', { ...empty, phase: 'start', level: 'info', meta: JSON.stringify({ provider: 'openai', model: 'model-a' }) });
    log('other-stage', '2026-10-02T12:00:01Z', { ...empty, stage_id: 'other', phase: 'start', level: 'info', meta: JSON.stringify({ provider: 'other', model: 'wrong' }) });
    for (let i = 1; i <= 3; i++) log(`retry-${i}`, `2026-10-02T12:00:0${i + 1}Z`, { ...empty, level: 'warn', phase: 'retry' });
    log('success', '2026-10-02T12:00:05Z');
    log('later-start', '2026-10-02T12:01:00Z', { ...empty, phase: 'start', level: 'info', meta: JSON.stringify({ provider: 'openai', model: 'model-b' }) });
    log('later-error', '2026-10-02T12:01:01Z', { ...empty, level: 'error' });
    const models = summarizeModels(await loadUsageRows('w1', null), {});
    expect(models.find((model) => model.model === 'model-a')).toMatchObject({ calls: 1, failures: 3, attempts: 4, failureRate: 0.75 });
    expect(models.find((model) => model.model === 'model-b')).toMatchObject({ failures: 1, attempts: 1 });
  });

  it('attributes OCR to its successful result, excluding failed and unchanged retries', async () => {
    revision(1, 'ocr', '2026-10-02 10:00:00');
    revision(2, 'user', '2026-10-02 10:01:00');
    const ocr = { project_id: null, pipeline_id: null, chunk_id: null, scope: 'ocr', transcription_document_id: 'd1', transcription_segment_id: 's1' };
    log('ocr-good', '2026-10-02T10:00:00.200Z', ocr);
    log('ocr-unchanged', '2026-10-02T10:03:00Z', { ...ocr, model: 'unchanged-model', level: 'warn' });
    log('ocr-failed', '2026-10-02T10:04:00Z', { ...ocr, model: 'failed-model', level: 'error' });
    expect(await loadOcrCorrections('w1', null)).toEqual([{ ocr_text: 'testo OCR', final_text: 'testo corretto', model: 'model-a' }]);
    expect(await loadOcrCorrections('w2', null)).toEqual([]);
    expect(await loadOcrCorrections(null, '2026-10-03T00:00:00Z')).toEqual([]);
  });

  it('does not invent an OCR model if there is no matching successful log', async () => {
    revision(1, 'ocr', '2026-10-02 10:00:00');
    revision(2, 'user', '2026-10-02 10:01:00');
    log('old-ocr', '2026-10-01T10:00:00Z', { scope: 'ocr', transcription_segment_id: 's1' });
    expect((await loadOcrCorrections('w1', null))[0].model).toBeNull();
  });

  it('uses a local month boundary as an instant, including the first second and excluding the previous evening', async () => {
    const now = new Date(2026, 9, 10, 12);
    const start = new Date(2026, 9, 1).getTime();
    log('before', new Date(start - 1000).toISOString());
    log('after', new Date(start + 1000).toISOString());
    const summary = await loadMonthSummary('w1', now);
    expect(summary.usage).toHaveLength(1);
    expect(summary.usage[0].at).toBe(new Date(start + 1000).toISOString());
    expect(summary.fragments).toBe(1);
    const activity = await loadActivity('w1', new Date(start).toISOString());
    expect(activity.reduce((sum, row) => sum + row.count, 0)).toBe(1);
  });

  it('counts historical errors, excluding completed and search jobs', async () => {
    db.exec(`INSERT INTO jobs (id,job_type,status,created_at) VALUES
      ('old','ocr_pages','error','2020-01-01'), ('done','ocr_pages','completed','2026-10-01'),
      ('search','provider_search','error','2026-10-01');`);
    expect(await loadFailedJobCount()).toBe(1);
  });

  it('batches remaining chunks and estimate settings without reading glossary contents', async () => {
    const chunks = await loadRemainingChunks(['p1', 'p2']);
    expect(chunks.map((row) => row.source_text).sort()).toEqual(['altro', 'da fare']);
    const configs = await loadPipelineEstimateConfigs(chunks.map((row) => row.pipeline_id));
    expect([...configs.keys()].sort()).toEqual(['pi1', 'pi2']);
    expect(select).toHaveBeenCalledTimes(2);
    expect(await loadRemainingChunks([])).toEqual([]);
    expect(await loadPipelineEstimateConfigs([])).toEqual(new Map());
    expect(select).toHaveBeenCalledTimes(2);
  });
});
