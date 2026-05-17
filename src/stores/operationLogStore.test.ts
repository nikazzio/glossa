import { beforeEach, describe, expect, it } from 'vitest';
import { logOperation, useOperationLogStore } from './operationLogStore';

beforeEach(() => {
  useOperationLogStore.setState({ entries: [] });
});

describe('operationLogStore', () => {
  it('appends timestamped frontend operation logs', () => {
    logOperation({ level: 'info', scope: 'pipeline', message: 'run started' });

    const [entry] = useOperationLogStore.getState().entries;
    expect(entry.message).toBe('run started');
    expect(entry.scope).toBe('pipeline');
    expect(entry.id).toContain('op-');
    expect(entry.at).toContain('T');
  });

  it('caps the log buffer', () => {
    for (let i = 0; i < 2100; i++) {
      logOperation({ level: 'info', scope: 'chunk', message: `entry-${i}` });
    }

    const entries = useOperationLogStore.getState().entries;
    expect(entries).toHaveLength(2000);
    expect(entries[0].message).toBe('entry-100');
    expect(entries.at(-1)?.message).toBe('entry-2099');
  });

  it('preserves phase, durationMs and detailKind on appended entries', () => {
    logOperation({
      level: 'success',
      scope: 'stage',
      message: 'stage completed',
      phase: 'end',
      durationMs: 1234,
      detailKind: 'json',
      detail: '{"foo":"bar"}',
    });

    const [entry] = useOperationLogStore.getState().entries;
    expect(entry.phase).toBe('end');
    expect(entry.durationMs).toBe(1234);
    expect(entry.detailKind).toBe('json');
    expect(entry.detail).toBe('{"foo":"bar"}');
  });
});
