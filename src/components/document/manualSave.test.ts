import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { saveVersionWithFeedback } from './manualSave';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const t = ((key: string) => key) as TFunction;

describe('manual version save feedback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps revision write details in logs and shows only translated feedback', async () => {
    useProjectStore.setState({ saveState: 'saved', saveVersionNow: vi.fn().mockRejectedValue(new Error('private constraint')) });
    saveVersionWithFeedback(t);
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('document.versionSaveFailed'));
  });
});
