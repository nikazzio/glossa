import { BookPlus, Brain, Check, Clipboard, Database, Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { usePhraseMemoryMatches } from '../../hooks/usePhraseMemoryMatches';
import { useSaveToMemory } from '../../hooks/useSaveToMemory';
import { usePhraseMemoryStore, type PhraseMemoryMatch } from '../../stores/phraseMemoryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { listPhraseMemoryEntries } from '../../services/phraseMemoryService';
import { classifyError } from '../../utils/retry';
import { IconButton, SectionLabel } from '../ui';
import { ExtractTermDialog } from './ExtractTermDialog';

const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1;
const DEFAULT_THRESHOLD = 0.75;

// classifyError() drives the pipeline's retry logic too; here we only use it
// to pick which reason to show — a memory search never retries on its own.
const MEMORY_SEARCH_ERROR_KEYS: Partial<Record<ReturnType<typeof classifyError>, string>> = {
  quota_exceeded: 'memory.searchFailedQuota',
  rate_limit: 'memory.searchFailedRateLimit',
  config: 'memory.searchFailedConfig',
  network: 'memory.searchFailedNetwork',
};

export function memorySearchErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return MEMORY_SEARCH_ERROR_KEYS[classifyError(message)] ?? 'memory.searchFailed';
}

interface MemoryTabProps {
  panelId: string;
  labelledBy: string;
  currentChunkId: string | null;
}

export function MemoryTab({ panelId, labelledBy, currentChunkId }: MemoryTabProps) {
  const { t } = useTranslation();
  const { matches, enabledMatchIds, selectedMatches, hasMatches, toggleEnabled } =
    usePhraseMemoryMatches(currentChunkId);
  const [extractingMatch, setExtractingMatch] = useState<PhraseMemoryMatch | null>(null);
  const [chunkMemoryCount, setChunkMemoryCount] = useState<number | null>(null);
  const { saveToMemory, isSaving } = useSaveToMemory();
  const { runSearchForChunk } = usePhraseMemoryAutoSearch({ auto: false });
  const searchStatus = usePhraseMemoryStore((s) => s.searchStatus);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const threshold = usePipelineStore((s) => s.config.phraseMemorySimilarityThreshold ?? DEFAULT_THRESHOLD);
  const setConfig = usePipelineStore((s) => s.setConfig);

  const effectiveThreshold = Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD;

  const handleThresholdChange = (value: number) => {
    setConfig((prev) => ({ ...prev, phraseMemorySimilarityThreshold: value }));
  };

  useEffect(() => {
    let cancelled = false;
    async function loadCount(): Promise<void> {
      if (!activeWorkspace || !currentChunkId) {
        if (!cancelled) setChunkMemoryCount(null);
        return;
      }
      try {
        const entries = await listPhraseMemoryEntries(activeWorkspace.id);
        if (!cancelled) {
          setChunkMemoryCount(entries.filter((e) => e.chunkId === currentChunkId).length);
        }
      } catch {
        if (!cancelled) setChunkMemoryCount(null);
      }
    }
    void loadCount();
    return () => { cancelled = true; };
  }, [activeWorkspace?.id, currentChunkId]);

  const handleRefresh = async () => {
    if (!currentChunkId) return;
    try {
      await runSearchForChunk(currentChunkId);
    } catch (err) {
      toast.error(t(memorySearchErrorKey(err)));
    }
  };

  const handleSaveToMemory = async () => {
    const previousCount = chunkMemoryCount ?? null;
    try {
      const savedCount = await saveToMemory(currentChunkId ? [currentChunkId] : []);
      if (activeWorkspace && currentChunkId) {
        const entries = await listPhraseMemoryEntries(activeWorkspace.id);
        setChunkMemoryCount(entries.filter((e) => e.chunkId === currentChunkId).length);
      }
      if (savedCount === 0) {
        if (previousCount && previousCount > 0) {
          toast.message(t('memory.chunkAlreadySaved', { count: previousCount }));
        } else {
          toast.message(t('memory.nothingToSave'));
        }
        return;
      }
      toast.success(t('memory.savedToMemory', { count: savedCount }));
    } catch {
      toast.error(t('memory.saveToMemoryFailed'));
    }
  };

  const saveButtonLabel = chunkMemoryCount && chunkMemoryCount > 0
    ? t('memory.regenerateMemoryButton')
    : t('memory.saveToMemoryButton');

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <MemoryReportSection
        chunkMemoryCount={chunkMemoryCount}
        isSaving={isSaving}
        currentChunkId={currentChunkId}
        saveButtonLabel={saveButtonLabel}
        onSave={() => void handleSaveToMemory()}
      />
      <MemoryActionsSection
        currentChunkId={currentChunkId}
        effectiveThreshold={effectiveThreshold}
        searchStatus={searchStatus}
        hasMatches={hasMatches}
        matches={matches}
        enabledMatchIds={enabledMatchIds}
        onToggleEnabled={toggleEnabled}
        onRefresh={() => void handleRefresh()}
        onExtractTerm={setExtractingMatch}
        onThresholdChange={handleThresholdChange}
      />
      {extractingMatch && (
        <ExtractTermDialog
          sourcePhrase={extractingMatch.sourcePhrase}
          targetPhrase={extractingMatch.targetPhrase}
          onClose={() => setExtractingMatch(null)}
          onSuccess={() => setExtractingMatch(null)}
        />
      )}
    </div>
  );
}

// ── Report section ────────────────────────────────────────────────────────────
// Stato passivo: quante frasi sono state salvate da questo chunk + azione salva.
// Candidato futuro per colonna sinistra (PipelineSidebar).

interface MemoryReportSectionProps {
  chunkMemoryCount: number | null;
  isSaving: boolean;
  currentChunkId: string | null;
  saveButtonLabel: string;
  onSave: () => void;
}

function MemoryReportSection({
  chunkMemoryCount,
  isSaving,
  currentChunkId,
  saveButtonLabel,
  onSave,
}: MemoryReportSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 border-b border-editorial-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={Brain} label={t('document.insightsTabMemory')} />
        <IconButton
          size="md"
          title={saveButtonLabel}
          onClick={onSave}
          disabled={isSaving || !currentChunkId}
          tooltipSide="left"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
        </IconButton>
      </div>
      {chunkMemoryCount !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-editorial-success/35 bg-editorial-success/10 font-display text-sm italic text-editorial-success">
            {chunkMemoryCount}
          </div>
          <p className="text-xs text-editorial-muted">{t('memory.memoriesLabel')}</p>
        </div>
      )}
    </div>
  );
}

// ── Actions section ───────────────────────────────────────────────────────────
// Operazioni interattive: soglia, ricerca, selezione match.
// Candidato futuro per colonna sinistra (PipelineSidebar).

interface MemoryActionsSectionProps {
  currentChunkId: string | null;
  effectiveThreshold: number;
  searchStatus: string;
  hasMatches: boolean;
  matches: PhraseMemoryMatch[];
  enabledMatchIds: Set<string>;
  onToggleEnabled: (id: string) => void;
  onRefresh: () => void;
  onExtractTerm: (match: PhraseMemoryMatch) => void;
  onThresholdChange: (value: number) => void;
}

function MemoryActionsSection({
  currentChunkId,
  effectiveThreshold,
  searchStatus,
  hasMatches,
  matches,
  enabledMatchIds,
  onToggleEnabled,
  onRefresh,
  onExtractTerm,
  onThresholdChange,
}: MemoryActionsSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-editorial-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-relaxed text-editorial-muted">
            {hasMatches ? t('memory.selectionHint') : t('memory.coldStartBodyShort')}
          </p>
          <IconButton
            size="md"
            tone={searchStatus === 'searching' ? 'running' : 'default'}
            title={searchStatus === 'searching' ? t('memory.searching') : t('memory.refreshButton')}
            onClick={onRefresh}
            disabled={!currentChunkId || searchStatus === 'searching'}
            tooltipSide="left"
          >
            {searchStatus === 'searching'
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCcw size={13} />}
          </IconButton>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="memory-threshold"
              className="text-[10px] font-sans uppercase tracking-[0.28em] text-editorial-muted"
            >
              {t('memory.similarityThreshold')}
            </label>
            <span className="font-mono text-xs font-bold text-editorial-accent">
              {effectiveThreshold.toFixed(2)}
            </span>
          </div>
          <input
            id="memory-threshold"
            type="range"
            min={MIN_THRESHOLD}
            max={MAX_THRESHOLD}
            step="0.01"
            value={effectiveThreshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
            className="w-full accent-editorial-accent"
            aria-label={t('memory.similarityThreshold')}
          />
        </div>
      </div>

      {hasMatches ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 custom-scrollbar">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              enabled={enabledMatchIds.has(match.id)}
              onToggle={() => onToggleEnabled(match.id)}
              onExtractTerm={() => onExtractTerm(match)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Brain size={28} className="text-editorial-border" />
          <p className="text-sm font-medium text-editorial-muted">
            {t('memory.coldStartTitle')}
          </p>
        </div>
      )}
    </>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: PhraseMemoryMatch;
  enabled: boolean;
  onToggle: () => void;
  onExtractTerm: () => void;
}

function MatchCard({ match, enabled, onToggle, onExtractTerm }: MatchCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(match.targetPhrase);
      setCopied(true);
      toast.success(t('memory.appliedToClipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('errors.clipboardFailed'));
    }
  };

  return (
    <article className={`space-y-4 rounded-lg border bg-editorial-bg p-4 transition-colors ${enabled ? 'border-editorial-accent/70' : 'border-editorial-border'}`}>
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-w-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            className="h-4 w-4 shrink-0 rounded border-editorial-border accent-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('memory.enableMatch')}
          />
          <span className="truncate text-sm font-medium text-editorial-ink">
            {t('memory.matchToggleLabel')}
          </span>
        </label>
        <span className="shrink-0 font-mono text-xs font-bold text-editorial-accent">
          {Math.round(match.score * 100)}%
        </span>
      </div>

      <div className="space-y-3">
        <div className="rounded-md bg-editorial-textbox/45 px-3 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.28em] text-editorial-muted">
            {t('memory.sourcePhraseShort')}
          </p>
          <div className="text-sm leading-relaxed text-editorial-charcoal">
            {match.sourcePhrase}
          </div>
        </div>
        <div className="rounded-md bg-editorial-textbox/45 px-3 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.28em] text-editorial-muted">
            {t('glossary.translation')}
          </p>
          <div className="text-sm leading-relaxed text-editorial-ink">
            {match.targetPhrase}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <IconButton size="md" title={t('memory.copyTranslationTitle')} onClick={() => void handleCopy()} tooltipSide="left">
          {copied ? <Check size={13} className="text-editorial-success" /> : <Clipboard size={13} />}
        </IconButton>
        <IconButton size="md" title={t('memory.extractTermButton')} onClick={onExtractTerm} tooltipSide="left">
          <BookPlus size={13} />
        </IconButton>
      </div>
    </article>
  );
}
