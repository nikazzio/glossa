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
    for (let i = 0; i < 420; i++) {
      logOperation({ level: 'info', scope: 'chunk', message: `entry-${i}` });
    }

    const entries = useOperationLogStore.getState().entries;
    expect(entries).toHaveLength(400);
    expect(entries[0].message).toBe('entry-20');
    expect(entries.at(-1)?.message).toBe('entry-419');
  });
});
