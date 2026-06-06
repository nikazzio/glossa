import { BookPlus, Brain, Check, Clipboard, Database, Loader2, RefreshCcw, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { usePhraseMemoryMatches } from '../../hooks/usePhraseMemoryMatches';
import { useSaveToMemory } from '../../hooks/useSaveToMemory';
import { usePhraseMemoryStore, type PhraseMemoryMatch } from '../../stores/phraseMemoryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { confirm } from '../../stores/confirmStore';
import { listPhraseMemoryEntries } from '../../services/phraseMemoryService';
import { IconButton, SectionLabel } from '../ui';
import { ExtractTermDialog } from './ExtractTermDialog';

const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1;
const DEFAULT_THRESHOLD = 0.75;

interface MemoryTabProps {
  panelId: string;
  labelledBy: string;
  currentChunkId: string | null;
  onRerun: (selectedMatches: PhraseMemoryMatch[]) => void;
}

export function MemoryTab({ panelId, labelledBy, currentChunkId, onRerun }: MemoryTabProps) {
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

    async function loadChunkMemoryCount(): Promise<void> {
      if (!activeWorkspace || !currentChunkId) {
        if (!cancelled) setChunkMemoryCount(null);
        return;
      }
      try {
        const entries = await listPhraseMemoryEntries(activeWorkspace.id);
        if (!cancelled) {
          setChunkMemoryCount(entries.filter((entry) => entry.chunkId === currentChunkId).length);
        }
      } catch {
        if (!cancelled) setChunkMemoryCount(null);
      }
    }

    void loadChunkMemoryCount();

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, currentChunkId]);

  const handleRefresh = async () => {
    if (!currentChunkId) return;
    try {
      await runSearchForChunk(currentChunkId);
    } catch {
      toast.error(t('memory.searchFailed'));
    }
  };

  const handleSaveToMemory = async () => {
    const previousCount = chunkMemoryCount ?? null;
    try {
      const savedCount = await saveToMemory(currentChunkId ? [currentChunkId] : []);
      if (activeWorkspace && currentChunkId) {
        const entries = await listPhraseMemoryEntries(activeWorkspace.id);
        setChunkMemoryCount(entries.filter((entry) => entry.chunkId === currentChunkId).length);
      }
      if (savedCount === 0) {
        if (previousCount && previousCount > 0) {
          toast.message(t('memory.nothingToSave'));
          return;
        }
        toast.message(t('memory.nothingToSave'));
        return;
      }
      toast.success(t('memory.savedToMemory', { count: savedCount }));
    } catch {
      toast.error(t('memory.saveToMemoryFailed'));
    }
  };

  const handleRerun = async () => {
    if (selectedMatches.length === 0) return;
    const ok = await confirm({
      title: t('memory.rerunConfirmTitle'),
      message: t('memory.rerunConfirmMessage', { count: selectedMatches.length }),
      confirmLabel: t('memory.rerunConfirmAction'),
    });
    if (!ok) return;
    onRerun(selectedMatches);
  };

  const saveButtonLabel = chunkMemoryCount && chunkMemoryCount > 0
    ? t('memory.regenerateMemoryButton')
    : t('memory.saveToMemoryButton');
  const rerunTitle = selectedMatches.length > 0
    ? t('memory.rerunButton')
    : t('memory.rerunDisabledHint');

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-editorial-border px-4 py-3">

        {/* Row 1: label + match action buttons */}
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={Brain} label={t('document.insightsTabMemory')} />
          <div className="flex items-center gap-1">
            <IconButton
              size="md"
              title={rerunTitle}
              onClick={() => void handleRerun()}
              disabled={selectedMatches.length === 0}
              tooltipSide="left"
            >
              <RotateCcw size={13} />
            </IconButton>
            <IconButton
              size="md"
              tone={searchStatus === 'searching' ? 'running' : 'default'}
              title={searchStatus === 'searching' ? t('memory.searching') : t('memory.refreshButton')}
              onClick={() => void handleRefresh()}
              disabled={!currentChunkId || searchStatus === 'searching'}
              tooltipSide="left"
            >
              {searchStatus === 'searching' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
            </IconButton>
          </div>
        </div>

        {/* Threshold slider — below match button, controls search sensitivity */}
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
            onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
            className="w-full accent-editorial-accent"
            aria-label={t('memory.similarityThreshold')}
          />
        </div>

        {/* Divider between match controls and memory storage */}
        <div className="border-t border-editorial-border/50 pt-3">
          {chunkMemoryCount !== null ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-editorial-success/35 bg-editorial-success/10 font-display text-sm italic text-editorial-success">
                  {chunkMemoryCount}
                </div>
                <p className="min-w-0 text-sm font-medium leading-snug text-editorial-muted">
                  {t('memory.memoriesLabel')}
                </p>
              </div>
              <IconButton
                size="md"
                title={saveButtonLabel}
                onClick={() => void handleSaveToMemory()}
                disabled={isSaving || !currentChunkId}
                tooltipSide="left"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
              </IconButton>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm leading-snug text-editorial-muted">
                {hasMatches ? t('memory.selectionHint') : t('memory.coldStartBodyShort')}
              </p>
              <IconButton
                size="md"
                title={saveButtonLabel}
                onClick={() => void handleSaveToMemory()}
                disabled={isSaving || !currentChunkId}
                tooltipSide="left"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {hasMatches ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 custom-scrollbar">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              enabled={enabledMatchIds.has(match.id)}
              onToggle={() => toggleEnabled(match.id)}
              onExtractTerm={() => setExtractingMatch(match)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Brain size={28} className="text-editorial-border" />
          <p className="text-sm font-medium text-editorial-muted">
            {t('memory.coldStartTitle')}
          </p>
          {searchStatus === 'searching' && (
            <Loader2 size={16} className="animate-spin text-editorial-running" />
          )}
        </div>
      )}

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

        <div className="rounded-md border border-editorial-border/60 bg-editorial-bg px-3 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.28em] text-editorial-muted">
            {t('glossary.translation')}
          </p>
          <div className="text-sm leading-relaxed text-editorial-ink">
            {match.targetPhrase}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <IconButton
          size="md"
          title={t('memory.copyTranslationTitle')}
          onClick={() => void handleCopy()}
          tooltipSide="left"
        >
          {copied ? <Check size={13} className="text-editorial-success" /> : <Clipboard size={13} />}
        </IconButton>
        <IconButton
          size="md"
          title={t('memory.extractTermButton')}
          onClick={onExtractTerm}
          tooltipSide="left"
        >
          <BookPlus size={13} />
        </IconButton>
      </div>
    </article>
  );
}
