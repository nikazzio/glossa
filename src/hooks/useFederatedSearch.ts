import { useCallback, useEffect, useRef, useState } from 'react';
import { onJobChanged } from '../services/jobsService';
import { getSearch, listSearches, type SearchRun, type SearchResultPage } from '../services/federatedSearchService';
import { logger } from '../utils/logger';

/** Job bursts arrive faster than a person reads: a page landing, a status
 *  change and a progress note within the same instant are one read, not three. */
const COALESCE_MS = 250;
const HISTORY_PAGE = 50;

/** Subscribe first, then read. An event during a snapshot forces another read. */
export function useFederatedSearch(id?: string) {
  const [runs,setRuns] = useState<SearchRun[]>([]);
  const [selected,setSelected] = useState<SearchRun | null>(null);
  const [pages,setPages] = useState<SearchResultPage[]>([]);
  const [error,setError] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [revision,setRevision] = useState(0);
  const [historyPages,setHistoryPages] = useState(1);
  const [hasMore,setHasMore] = useState(false);
  const generation = useRef(0);
  const selectedId = useRef(id);
  const refresh = useCallback(() => setRevision((v) => v+1),[]);
  useEffect(() => {
    let disposed = false; let unsubscribe: (() => void) | undefined;
    const epoch = ++generation.current;
    let dirty = false; let reading = false; let timer: ReturnType<typeof setTimeout> | undefined;
    // Older searches keep their jobs terminal: their pages of history are read
    // once and only re-read when the reader asks for them again.
    let tail: SearchRun[] = [];
    let tailPages = 0;
    let lastPageSize = 0;
    setLoading(true);
    setSelected((current) => current?.id === id ? current : null);
    setPages((current) => selectedId.current === id ? current : []);
    selectedId.current = id;
    const read = async () => {
      while (dirty && !disposed) {
        dirty = false;
        const started = performance.now();
        try {
          if (tailPages !== historyPages - 1) {
            const fetched = await Promise.all(Array.from({length: historyPages-1}, (_,index) => listSearches((index+1)*HISTORY_PAGE)));
            tail = fetched.flat();
            tailPages = historyPages - 1;
            lastPageSize = fetched.at(-1)?.length ?? 0;
          }
          const [head,snapshot] = await Promise.all([listSearches(0), id ? getSearch(id) : null]);
          if (disposed || epoch !== generation.current) break;
          setRuns([...head,...tail]);
          setHasMore((tailPages > 0 ? lastPageSize : head.length) === HISTORY_PAGE);
          setSelected(snapshot?.run ?? null);
          setPages(snapshot?.pages ?? []);
          setError(null);
          logger.debug('federation.snapshot.read', {
            searchId: id ?? null, runs: head.length + tail.length,
            resultPages: snapshot?.pages.length ?? 0,
            results: snapshot?.pages.reduce((sum,page) => sum + page.results.length, 0) ?? 0,
            durationMs: Math.round(performance.now()-started),
          });
        } catch (failure: unknown) {
          if (!disposed) setError(String(failure));
          logger.warn('federation.snapshot.failed', { searchId: id ?? null, durationMs: Math.round(performance.now()-started) });
        } finally { if (!disposed) setLoading(false); }
      }
      reading = false;
    };
    const schedule = (immediate: boolean) => {
      dirty = true;
      if (reading || timer) return;
      if (immediate) { reading = true; void read(); return; }
      timer = setTimeout(() => { timer = undefined; reading = true; void read(); }, COALESCE_MS);
    };
    void onJobChanged((job) => { if (job.jobType === 'provider_search') schedule(false); })
      .then((stop) => { if (disposed) stop(); else { unsubscribe=stop; schedule(true); } })
      .catch((failure: unknown) => { if (!disposed) { setError(String(failure));setLoading(false); } });
    return () => { disposed=true; if (timer) clearTimeout(timer); unsubscribe?.(); };
  },[id,revision,historyPages]);
  return {runs,selected,pages,error,loading,refresh,hasMore,loadMore:() => setHistoryPages((count) => count+1)};
}
