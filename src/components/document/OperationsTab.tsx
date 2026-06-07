import { Copy, ExternalLink, Loader2, Search, TerminalSquare, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useChunksStore } from '../../stores/chunksStore';
import {
  useOperationLogStore,
  type OperationLogEntry,
  type OperationLogLevel,
  type OperationLogScope,
} from '../../stores/operationLogStore';
import { usePricingStore } from '../../stores/pricingStore';
import {
  aggregateEntries,
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
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
  'chunk',
];
const ALL_LEVELS: OperationLogLevel[] = ['info', 'success', 'warn', 'error'];

const LEVEL_COLOR: Record<OperationLogLevel, string> = {
  error: 'text-[#ff6b6b]',
  warn: 'text-[#f6c90e]',
  success: 'text-[#69db7c]',
  info: 'text-[#74c0fc]',
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
  const pricingOverrides = usePricingStore((state) => state.overrides);
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
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex h-full flex-col">
      <Header
        isProcessing={isProcessing}
        processingChunk={processingChunk}
        processingChunkIndex={processingChunkIndex}
        chunksCount={chunks.length}
        onGoToChunk={() => processingChunk && onSelectChunk(processingChunk.id)}
        onClear={clear}
      />

      {filteredEntries.length > 0 && <SummaryRow stats={stats} />}

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
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-editorial-muted">
          {t('document.operationsEmpty')}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto bg-[#111111] px-4 py-4 font-mono text-xs text-[#d6d6d6] custom-scrollbar"
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
  processingChunk: TranslationChunk | null;
  processingChunkIndex: number;
  chunksCount: number;
  onGoToChunk: () => void;
  onClear: () => void;
}

function Header({
  isProcessing,
  processingChunk,
  processingChunkIndex,
  chunksCount,
  onGoToChunk,
  onClear,
}: HeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-editorial-border px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TerminalSquare size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
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
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            title={t('document.operationsClear')}
            aria-label={t('document.operationsClear')}
            className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {isProcessing && (
        <div className="mt-2.5 flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 size={11} className="animate-spin shrink-0 text-[#9eb4ff]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9eb4ff]">
            {t('document.operationsRunning')}
          </span>
          {processingChunkIndex >= 0 && (
            <span className="font-display text-xs italic text-[#9eb4ff]/70">
              {indexPad(processingChunkIndex + 1)}/{indexPad(chunksCount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────

interface SummaryRowProps {
  stats: ReturnType<typeof aggregateEntries>;
}

function SummaryRow({ stats }: SummaryRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-editorial-border px-5 py-3 text-[11px] font-sans">
      <SummaryItem label={t('log.summaryInput')} value={stats.totalInput.toLocaleString()} />
      <SummaryItem label={t('log.summaryOutput')} value={stats.totalOutput.toLocaleString()} />
      <SummaryItem label={t('log.cacheHitRate')} value={formatCacheHitRate(stats.cacheHitRate)} />
      <SummaryItem
        label={t('log.totalDuration')}
        value={stats.totalDurationMs > 0 ? formatDurationMs(stats.totalDurationMs) : '—'}
      />
      <SummaryItem label={t('log.totalCost')} value={formatUsd(stats.totalUsd)} />
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-[0.22em] text-editorial-muted">{label}</span>
      <span className="font-display text-sm tabular-nums text-editorial-ink">{value}</span>
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
    <div className="border-b border-white/10 bg-[#111111] px-4 py-2 font-mono text-xs space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-[#555] transition-colors hover:text-[#999] focus:outline-none"
        >
          {filtersOpen ? '▾' : '▸'} {t('log.filters')}
        </button>
        <div className="flex flex-1 items-center gap-2">
          <Search size={10} className="shrink-0 text-[#555]" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('log.search')}
            className="w-full bg-transparent text-[11px] text-[#d6d6d6] placeholder:text-[#444] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onToggleGrouped}
          aria-pressed={grouped}
          className={`shrink-0 text-[10px] uppercase tracking-[0.18em] transition-colors focus:outline-none ${
            grouped ? 'text-[#9eb4ff]' : 'text-[#555] hover:text-[#999]'
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
                className={`text-[10px] uppercase tracking-[0.18em] transition-colors focus:outline-none ${
                  scopeFilter.has(scope) ? 'text-[#cbd5e1]' : 'text-[#3a3a3a] line-through'
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
                className={`text-[10px] uppercase tracking-[0.18em] transition-colors focus:outline-none ${
                  levelFilter.has(level) ? LEVEL_COLOR[level] : 'text-[#3a3a3a] line-through'
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
          <details
            key={chunkId}
            open
            className="rounded-lg border border-white/10 bg-white/[0.02]"
          >
            <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#cbd5e1]">
              <span>
                {t('log.unitLabel')} {chunkIndex >= 0 ? indexPad(chunkIndex + 1) : chunkId}
              </span>
              {chunkStats && (
                <span className="text-[10px] text-[#94a3b8]">
                  {chunkStats.totalInput.toLocaleString()}→{chunkStats.totalOutput.toLocaleString()} ·{' '}
                  {formatCacheHitRate(chunkStats.cacheHitRate)} ·{' '}
                  {chunkStats.totalDurationMs > 0 ? formatDurationMs(chunkStats.totalDurationMs) : '—'}
                </span>
              )}
            </summary>
            <div className="space-y-2 px-3 pb-3">
              {looseEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} chunkIndexMap={chunkIndexMap} t={t} dense />
              ))}
              {stageBuckets.map(([stageKey, stageEntries]) => {
                const stageEnd = stageEntries.find((e) => e.phase === 'end');
                const stageStart = stageEntries.find((e) => e.phase === 'start');
                const stageHeader = labelForStageGroup(stageKey, stageStart, stageEnd, t);
                return (
                  <details key={stageKey} open className="rounded-md border border-white/5 bg-white/[0.02]">
                    <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-1.5 text-[11px]">
                      <span className="font-bold uppercase tracking-[0.18em] text-[#cbd5e1]">
                        {stageHeader.title}
                      </span>
                      <span className="text-[10px] text-[#94a3b8]">{stageHeader.meta}</span>
                    </summary>
                    <div className="space-y-2 px-3 pb-2">
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
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-[#555]">{t('log.newRun')}</span>
        <div className="h-px flex-1 bg-white/10" />
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
      <div className="flex items-baseline gap-2 text-[11px]">
        <span className="select-none text-[#444]">$</span>
        <span className="tabular-nums text-[#555]">{entry.at.slice(11, 19)}</span>
        <span className="text-[#555]">{scopeLabel.toLowerCase()}:{levelLabel.toLowerCase()}</span>
        {entry.durationMs != null && entry.phase === 'end' && (
          <span className="text-[#444]">{formatDurationMs(entry.durationMs)}</span>
        )}
        {chunkIndex >= 0 && (
          <span className="text-[#444]">{t('log.unitLabel')} {indexPad(chunkIndex + 1)}</span>
        )}
      </div>
      <p className={`mt-0.5 pl-4 text-[11px] leading-relaxed ${color}`}>{entry.message}</p>
      {metaItems.length > 0 && (
        <p className="mt-0.5 pl-4 text-[10px] text-[#555]">{metaItems.join('  ')}</p>
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
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 text-[10px] text-[#555] hover:text-[#888]">
        <span>▶ {summaryLabel}</span>
        <button
          type="button"
          onClick={onCopy}
          title={t('log.copy')}
          aria-label={t('log.copy')}
          className="flex items-center gap-1 text-[10px] text-[#555] transition-colors hover:text-[#9eb4ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Copy size={10} />
          {t('log.copy')}
        </button>
      </summary>
      <pre
        className={`mt-1 max-h-[480px] overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed custom-scrollbar ${
          isError ? 'text-[#fda4af] bg-[#3b0a0f]/30 rounded-md p-2 border border-[#ff6b6b]/20' : 'text-[#7a8fa6]'
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
