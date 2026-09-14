import { useEffect, useState } from 'react';
import { logger } from '../utils/logger';

/** A broken section must not blank the rest of the dashboard or become zero. */
export function useDashboardResource<T>(load: (workspaceId: string | null) => Promise<T>, workspaceId: string | null, revision: number) {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({ data: null, error: false, loading: true });
  useEffect(() => {
    let disposed = false;
    setState({ data: null, error: false, loading: true });
    void load(workspaceId).then((data) => { if (!disposed) setState({ data, error: false, loading: false }); })
      .catch(() => {
        logger.warn('dashboard.section.failed', { section: load.name, workspaceId });
        if (!disposed) setState({ data: null, error: true, loading: false });
      });
    return () => { disposed = true; };
  }, [load, workspaceId, revision]);
  return state;
}
