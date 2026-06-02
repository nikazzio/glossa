import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({}),
  select: vi.fn().mockResolvedValue([]),
}));

vi.mock('./dbService', () => ({ getDb: vi.fn(() => Promise.resolve(mockDb)) }));

const { seedBuiltinPresets, listPresets } = await import('./phraseMemoryPresetService');

describe('phraseMemoryPresetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.execute.mockResolvedValue({});
    mockDb.select.mockResolvedValue([]);
  });

  it('seedBuiltinPresets chiama execute 4 volte (uno per preset)', async () => {
    await seedBuiltinPresets(mockDb as never);
    expect(mockDb.execute).toHaveBeenCalledTimes(4);
  });

  it('listPresets mappa is_builtin integer a boolean', async () => {
    mockDb.select.mockResolvedValueOnce([
      {
        id: 'pmp_builtin_modern',
        name: 'Moderno',
        is_builtin: 1,
        config: '{"splitter":"regex","similarityThreshold":0.85,"maxResults":5,"minPhraseLength":20}',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const presets = await listPresets();
    expect(presets[0].isBuiltin).toBe(true);
    expect(presets[0].config.splitter).toBe('regex');
    expect(presets[0].config.similarityThreshold).toBe(0.85);
  });
});
