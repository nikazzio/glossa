import { Copy, ExternalLink, Loader2, Search, TerminalSquare, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import {
  useOperationLogStore,
  type OperationLogEntry,
  type OperationLogLevel,
  type OperationLogScope,
} from '../../stores/operationLogStore';
import { usePhraseMemoryStore } from '../../stores/phraseMemoryStore';
import { usePricingStore } from '../../stores/pricingStore';
import {
  aggregateEntries,
  formatCacheHitRate,
  formatDurationMs,
} from '../../utils/operationLogStats';
import { indexPad } from '../../utils';
import type { TranslationChunk } from '../../types';

interface OperationsTabProps {
  panelId: string;
  labelledBy: string;
  currentChunkId: string | null;
  chunks: TranslationChunk[];
  onSelectChunk: (id: string) => void;
}

const ALL_SCOPES: OperationLogScope[] = [
  'pipeline',
  'preflight',
  'invoke',
  'stage',
  'audit',
  'coherence',
  'memory',
  'chunk',
];
const ALL_LEVELS: OperationLogLevel[] = ['info', 'success', 'warn', 'error'];

const LEVEL_COLOR: Record<OperationLogLevel, string> = {
  error: 'text-terminal-error',
  warn: 'text-terminal-warn',
  success: 'text-terminal-success',
  info: 'text-terminal-info',
};

export function OperationsTab({
  panelId,
  labelledBy,
  currentChunkId,
  chunks,
  onSelectChunk,
}: OperationsTabProps) {
  const { t } = useTranslation();
  const entries = useOperationLogStore((state) => state.entries);
  const clear = useOperationLogStore((state) => state.clear);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const runStatus = usePipelineStore((s) => s.runStatus);
  const memoryJobStatus = usePhraseMemoryStore((s) => s.jobStatus);
  const pricingOverrides = usePricingStore((state) => state.overrides);

  const isMemoryRunning =
    memoryJobStatus.kind === 'running' &&
    (memoryJobStatus.chunkId === null || memoryJobStatus.chunkId === currentChunkId);
  const memoryProgress =
    memoryJobStatus.kind === 'running' && memoryJobStatus.total > 1
      ? { processed: memoryJobStatus.processed, total: memoryJobStatus.total }
      : null;
  const scrollRef = useRef<HTMLDivElement>(null);

  const [scopeFilter, setScopeFilter] = useState<Set<OperationLogScope>>(new Set(ALL_SCOPES));
  const [levelFilter, setLevelFilter] = useState<Set<OperationLogLevel>>(new Set(ALL_LEVELS));
  const [search, setSearch] = useState('');
  const [grouped, setGrouped] = useState(true);

  const chunkScopedEntries = useMemo(
    () => (currentChunkId ? entries.filter((entry) => entry.chunkId === currentChunkId) : entries),
    [entries, currentChunkId],
  );

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return chunkScopedEntries.filter((entry) => {
      if (!scopeFilter.has(entry.scope)) return false;
      if (!levelFilter.has(entry.level)) return false;
      if (!normalizedSearch) return true;
      const hay = `${entry.message} ${entry.detail ?? ''} ${JSON.stringify(entry.meta ?? {})}`.toLowerCase();
      return hay.includes(normalizedSearch);
    });
  }, [chunkScopedEntries, scopeFilter, levelFilter, search]);

  const stats = useMemo(
    () => aggregateEntries(chunkScopedEntries, pricingOverrides),
    [chunkScopedEntries, pricingOverrides],
  );

  const processingChunk = chunks.find((c) => c.status === 'processing') ?? null;
  const processingChunkIndex = processingChunk
    ? chunks.findIndex((c) => c.id === processingChunk.id)
    : -1;

  const stickyToBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickyToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [filteredEntries.length]);

  function onScroll(): void {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stickyToBottomRef.current = atBottom;
  }

  function toggleScope(scope: OperationLogScope): void {
    setScopeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  function toggleLevel(level: OperationLogLevel): void {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex h-full flex-col bg-terminal-bg">
      <Header
        isProcessing={isProcessing}
        isAuditOnly={isProcessing && runStatus !== 'running'}
        isMemoryRunning={isMemoryRunning}
        memoryProgress={memoryProgress}
        processingChunk={processingChunk}
        processingChunkIndex={processingChunkIndex}
        chunksCount={chunks.length}
        onGoToChunk={() => processingChunk && onSelectChunk(processingChunk.id)}
        onClear={clear}
      />

      <FilterBar
        scopeFilter={scopeFilter}
        levelFilter={levelFilter}
        search={search}
        grouped={grouped}
        onToggleScope={toggleScope}
        onToggleLevel={toggleLevel}
        onSearchChange={setSearch}
        onToggleGrouped={() => setGrouped((g) => !g)}
      />

      {filteredEntries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-terminal-secondary">
          {t('document.operationsEmpty')}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto bg-terminal-bg px-4 py-4 font-mono text-xs text-terminal-ink terminal-scrollbar"
        >
          {grouped ? (
            <GroupedView entries={filteredEntries} chunks={chunks} stats={stats} />
          ) : (
            <FlatView entries={filteredEntries} chunks={chunks} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

interface HeaderProps {
  isProcessing: boolean;
  isAuditOnly: boolean;
  isMemoryRunning: boolean;
  memoryProgress: { processed: number; total: number } | null;
  processingChunk: TranslationChunk | null;
  processingChunkIndex: number;
  chunksCount: number;
  onGoToChunk: () => void;
  onClear: () => void;
}

function Header({
  isProcessing,
  isAuditOnly,
  isMemoryRunning,
  memoryProgress,
  processingChunk,
  processingChunkIndex,
  chunksCount,
  onGoToChunk,
  onClear,
}: HeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-terminal-chrome px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TerminalSquare size={11} className="text-editorial-accent shrink-0" />
          <p className="text-xs font-sans uppercase tracking-[0.12em] text-terminal-secondary">
            {t('document.operationsShellTitle')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isProcessing && processingChunk && (
            <button
              type="button"
              onClick={onGoToChunk}
              title={t('document.operationsGoToChunk')}
              aria-label={t('document.operationsGoToChunk')}
              className="rounded-full border border-terminal-border p-2 text-terminal-secondary transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            title={t('document.operationsClear')}
            aria-label={t('document.operationsClear')}
            className="rounded-full border border-terminal-border p-2 text-terminal-secondary transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {isProcessing && (
        <div className="mt-2.5 flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 size={11} className="animate-spin shrink-0 text-terminal-accent" />
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-terminal-accent">
            {isAuditOnly ? t('document.auditRunning') : t('document.operationsRunning')}
          </span>
          {processingChunkIndex >= 0 && (
            <span className="font-display text-xs italic text-terminal-accent/70">
              {indexPad(processingChunkIndex + 1)}/{indexPad(chunksCount)}
            </span>
          )}
        </div>
      )}
      {isMemoryRunning && (
        <div className="mt-2.5 flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 size={11} className="animate-spin shrink-0 text-terminal-info" />
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-terminal-info">
            {t('document.memoryRunning')}
          </span>
          {memoryProgress !== null && (
            <span className="font-display text-xs italic text-terminal-info/70">
              {indexPad(memoryProgress.processed + 1)}/{indexPad(memoryProgress.total)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

interface FilterBarProps {
  scopeFilter: Set<OperationLogScope>;
  levelFilter: Set<OperationLogLevel>;
  search: string;
  grouped: boolean;
  onToggleScope: (scope: OperationLogScope) => void;
  onToggleLevel: (level: OperationLogLevel) => void;
  onSearchChange: (value: string) => void;
  onToggleGrouped: () => void;
}

function FilterBar({
  scopeFilter,
  levelFilter,
  search,
  grouped,
  onToggleScope,
  onToggleLevel,
  onSearchChange,
  onToggleGrouped,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scopeLabel = scopeLabels(t);
  const levelLabel = levelLabels(t);

  return (
    <div className="border-b border-terminal-line bg-terminal-bg px-4 py-2 font-mono text-xs space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="shrink-0 text-xs uppercase tracking-[0.1em] text-terminal-muted transition-colors hover:text-terminal-secondary focus:outline-none"
        >
          {filtersOpen ? '▾' : '▸'} {t('log.filters')}
        </button>
        <div className="flex flex-1 items-center gap-2">
          <Search size={10} className="shrink-0 text-terminal-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('log.search')}
            className="w-full bg-transparent text-xs text-terminal-ink placeholder:text-terminal-dim outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onToggleGrouped}
          aria-pressed={grouped}
          className={`shrink-0 text-xs uppercase tracking-[0.16em] transition-colors focus:outline-none ${
            grouped ? 'text-terminal-accent' : 'text-terminal-muted hover:text-terminal-secondary'
          }`}
        >
          {t('log.grouped')}
        </button>
      </div>

      {filtersOpen && (
        <div className="space-y-1 pt-0.5">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {ALL_SCOPES.map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => onToggleScope(scope)}
                aria-pressed={scopeFilter.has(scope)}
                className={`text-xs uppercase tracking-[0.16em] transition-colors focus:outline-none ${
                  scopeFilter.has(scope) ? 'text-terminal-ink' : 'text-terminal-dim line-through'
                }`}
              >
                {scopeLabel[scope]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {ALL_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onToggleLevel(level)}
                aria-pressed={levelFilter.has(level)}
                className={`text-xs uppercase tracking-[0.16em] transition-colors focus:outline-none ${
                  levelFilter.has(level) ? LEVEL_COLOR[level] : 'text-terminal-dim line-through'
                }`}
              >
                {levelLabel[level]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flat view ─────────────────────────────────────────────────────────────

function FlatView({ entries, chunks }: { entries: OperationLogEntry[]; chunks: TranslationChunk[] }) {
  const { t } = useTranslation();
  const chunkIndexMap = useMemo(() => new Map(chunks.map((c, i) => [c.id, i])), [chunks]);
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} chunkIndexMap={chunkIndexMap} t={t} />
      ))}
    </div>
  );
}

// ── Grouped view ──────────────────────────────────────────────────────────

interface GroupedViewProps {
  entries: OperationLogEntry[];
  chunks: TranslationChunk[];
  stats: ReturnType<typeof aggregateEntries>;
}

function GroupedView({ entries, chunks, stats }: GroupedViewProps) {
  const { t } = useTranslation();
  const chunkIndexMap = useMemo(() => new Map(chunks.map((c, i) => [c.id, i])), [chunks]);

  const groups = useMemo(() => groupEntries(entries), [entries]);

  return (
    <div className="space-y-3">
      {groups.unscoped.length > 0 && (
        <div className="space-y-2">
          {groups.unscoped.map((entry) => (
            <EntryCard key={entry.id} entry={entry} chunkIndexMap={chunkIndexMap} t={t} />
          ))}
        </div>
      )}

      {groups.chunks.map(({ chunkId, byStage, looseEntries }) => {
        const chunkIndex = chunkIndexMap.get(chunkId) ?? -1;
        const chunkStats = stats.byChunk.get(chunkId);
        const stageBuckets = Array.from(byStage.entries());
        return (
          <details key={chunkId} open className="mt-3">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 py-1.5 text-xs uppercase tracking-[0.1em] text-terminal-secondary list-none [&::-webkit-details-marker]:hidden">
              <span>
                {t('log.unitLabel')} {chunkIndex >= 0 ? indexPad(chunkIndex + 1) : chunkId}
              </span>
              {chunkStats && (
                <span className="text-xs text-terminal-muted">
                  {chunkStats.totalInput.toLocaleString()}→{chunkStats.totalOutput.toLocaleString()} ·{' '}
                  {formatCacheHitRate(chunkStats.cacheHitRate)} ·{' '}
                  {chunkStats.totalDurationMs > 0 ? formatDurationMs(chunkStats.totalDurationMs) : '—'}
                </span>
              )}
            </summary>
            <div className="ml-3 space-y-1.5 border-l border-terminal-line pl-3 pb-2">
              {looseEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} chunkIndexMap={chunkIndexMap} t={t} dense />
              ))}
              {stageBuckets.map(([stageKey, stageEntries]) => {
                const stageEnd = stageEntries.find((e) => e.phase === 'end');
                const stageStart = stageEntries.find((e) => e.phase === 'start');
                const stageHeader = labelForStageGroup(stageKey, stageStart, stageEnd, t);
                return (
                  <details key={stageKey} open className="mt-1.5">
                    <summary className="flex cursor-pointer select-none items-center justify-between gap-2 py-0.5 text-xs list-none [&::-webkit-details-marker]:hidden">
                      <span className="font-bold uppercase tracking-[0.1em] text-terminal-secondary">
                        {stageHeader.title}
                      </span>
                      <span className="text-xs text-terminal-muted">{stageHeader.meta}</span>
                    </summary>
                    <div className="ml-2 space-y-1.5 border-l border-terminal-line pl-2 pb-1">
                      {stageEntries.map((entry) => (
                        <EntryCard key={entry.id} entry={entry} chunkIndexMap={chunkIndexMap} t={t} dense />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

interface GroupedEntries {
  unscoped: OperationLogEntry[];
  chunks: Array<{
    chunkId: string;
    byStage: Map<string, OperationLogEntry[]>;
    looseEntries: OperationLogEntry[];
  }>;
}

function groupEntries(entries: OperationLogEntry[]): GroupedEntries {
  const unscoped: OperationLogEntry[] = [];
  const chunkOrder: string[] = [];
  const chunkMap = new Map<string, { byStage: Map<string, OperationLogEntry[]>; looseEntries: OperationLogEntry[] }>();

  for (const entry of entries) {
    if (!entry.chunkId) {
      unscoped.push(entry);
      continue;
    }
    if (!chunkMap.has(entry.chunkId)) {
      chunkMap.set(entry.chunkId, { byStage: new Map(), looseEntries: [] });
      chunkOrder.push(entry.chunkId);
    }
    const bucket = chunkMap.get(entry.chunkId)!;
    const stageKey = entry.stageId ?? defaultStageKeyForScope(entry.scope);
    if (stageKey) {
      const list = bucket.byStage.get(stageKey) ?? [];
      list.push(entry);
      bucket.byStage.set(stageKey, list);
    } else {
      bucket.looseEntries.push(entry);
    }
  }

  return {
    unscoped,
    chunks: chunkOrder.map((chunkId) => ({ chunkId, ...chunkMap.get(chunkId)! })),
  };
}

function defaultStageKeyForScope(scope: OperationLogScope): string | null {
  if (scope === 'audit') return '__audit__';
  if (scope === 'coherence') return '__coherence__';
  if (scope === 'memory') return '__memory__';
  return null;
}

function labelForStageGroup(
  stageKey: string,
  start: OperationLogEntry | undefined,
  end: OperationLogEntry | undefined,
  t: (k: string) => string,
): { title: string; meta: string } {
  let title: string;
  if (stageKey === '__audit__') title = t('log.scopeAudit');
  else if (stageKey === '__coherence__') title = t('log.scopeCoherence');
  else if (stageKey === '__memory__') title = t('log.scopeMemory');
  else {
    title = (start?.meta?.stageName as string | undefined) ?? t('log.scopeStage');
  }

  const parts: string[] = [];
  if (end?.durationMs != null) parts.push(formatDurationMs(end.durationMs));
  const meta = end?.meta ?? {};
  const input = typeof meta.inputTokens === 'number' ? meta.inputTokens : null;
  const output = typeof meta.outputTokens === 'number' ? meta.outputTokens : null;
  const cached = typeof meta.cachedInputTokens === 'number' ? meta.cachedInputTokens : null;
  if (input != null && output != null) parts.push(`${input.toLocaleString()}→${output.toLocaleString()} tok`);
  if (cached != null && cached > 0) parts.push(`cache ${cached.toLocaleString()}`);

  return { title, meta: parts.join(' · ') };
}

// ── Single entry card ─────────────────────────────────────────────────────

interface EntryCardProps {
  entry: OperationLogEntry;
  chunkIndexMap: Map<string, number>;
  t: (k: string) => string;
  dense?: boolean;
}

function EntryCard({ entry, chunkIndexMap, t, dense = false }: EntryCardProps) {
  if (entry.meta?.runBoundary === true) {
    return (
      <div className="flex items-center gap-3 py-1.5">
        <div className="h-px flex-1 bg-terminal-line" />
        <span className="text-xs uppercase tracking-[0.1em] text-terminal-muted">{t('log.newRun')}</span>
        <div className="h-px flex-1 bg-terminal-line" />
      </div>
    );
  }

  const color = LEVEL_COLOR[entry.level];
  const chunkIndex = entry.chunkId != null ? chunkIndexMap.get(entry.chunkId) ?? -1 : -1;
  const scopeLabel = scopeLabels(t)[entry.scope] ?? entry.scope;
  const levelLabel = levelLabels(t)[entry.level] ?? entry.level;
  const metaItems = formatMetaItems(entry.meta);

  return (
    <div className={dense ? 'py-0.5' : 'py-1'}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="select-none text-terminal-dim">$</span>
        <span className="tabular-nums text-terminal-secondary">{entry.at.slice(11, 19)}</span>
        <span className="text-terminal-secondary">{scopeLabel.toLowerCase()}:{levelLabel.toLowerCase()}</span>
        {entry.durationMs != null && entry.phase === 'end' && (
          <span className="text-terminal-muted">{formatDurationMs(entry.durationMs)}</span>
        )}
        {chunkIndex >= 0 && (
          <span className="text-terminal-muted">{t('log.unitLabel')} {indexPad(chunkIndex + 1)}</span>
        )}
      </div>
      <p className={`mt-0.5 pl-4 text-xs leading-relaxed ${color}`}>{entry.message}</p>
      {metaItems.length > 0 && (
        <p className="mt-0.5 pl-4 text-xs text-terminal-muted">{metaItems.join('  ')}</p>
      )}
      {entry.detail && <DetailBlock detail={entry.detail} kind={entry.detailKind} t={t} />}
    </div>
  );
}

// ── Detail block with copy ────────────────────────────────────────────────

function DetailBlock({
  detail,
  kind,
  t,
}: {
  detail: string;
  kind?: OperationLogEntry['detailKind'];
  t: (k: string) => string;
}) {
  const summaryLabel =
    kind === 'json'
      ? t('log.responseLabel')
      : kind === 'error'
        ? t('log.errorLabel')
        : kind === 'note'
          ? t('log.noteLabel')
          : t('log.showPrompt');

  async function onCopy(event: React.MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(detail);
      toast.success(t('log.copied'));
    } catch {
      toast.error(t('log.copyFailed'));
    }
  }

  const isError = kind === 'error';

  return (
    <details className="mt-1 pl-4">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 text-xs text-terminal-muted hover:text-terminal-secondary">
        <span>▶ {summaryLabel}</span>
        <button
          type="button"
          onClick={onCopy}
          title={t('log.copy')}
          aria-label={t('log.copy')}
          className="flex items-center gap-1 text-xs text-terminal-muted transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Copy size={10} />
          {t('log.copy')}
        </button>
      </summary>
      <pre
        className={`mt-1 max-h-[480px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed terminal-scrollbar ${
          isError
            ? 'text-terminal-error/80 bg-terminal-error/[0.08] rounded-md p-2 border border-terminal-error/20'
            : 'text-terminal-secondary'
        }`}
      >
        {detail}
      </pre>
    </details>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function scopeLabels(t: (k: string) => string): Record<OperationLogScope, string> {
  return {
    pipeline: t('log.scopePipeline'),
    preflight: t('log.scopePreflight'),
    invoke: t('log.scopeInvoke'),
    stage: t('log.scopeStage'),
    audit: t('log.scopeAudit'),
    coherence: t('log.scopeCoherence'),
    memory: t('log.scopeMemory'),
    chunk: t('log.scopeChunk'),
  };
}

function levelLabels(t: (k: string) => string): Record<OperationLogLevel, string> {
  return {
    info: t('log.levelInfo'),
    success: t('log.levelSuccess'),
    warn: t('log.levelWarn'),
    error: t('log.levelError'),
  };
}

function formatMetaItems(meta?: Record<string, unknown>): string[] {
  if (!meta) return [];
  return Object.entries(meta).flatMap(([key, value]) => {
    if (key === 'runBoundary') return [];
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return [`${key}: ${value.join(', ')}`];
    if (typeof value === 'object') return [`${key}: ${JSON.stringify(value)}`];
    return [`${key}: ${String(value)}`];
  });
}
