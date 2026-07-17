import { BookPlus, Check, Clipboard, Layers, Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryAutoSearch } from '../../../hooks/usePhraseMemoryAutoSearch';
import { usePhraseMemoryMatches } from '../../../hooks/usePhraseMemoryMatches';
import { usePhraseMemoryStore } from '../../../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../../../stores/phraseMemoryStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { classifyError } from '../../../utils/retry';
import { IconButton } from '../../ui';
import { ExtractTermDialog } from '../ExtractTermDialog';
import type { TranslationChunk } from '../../../types';

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

interface ReferencesTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

export function ReferencesTab({ panelId, labelledBy, currentChunk }: ReferencesTabProps) {
  const { t } = useTranslation();
  const currentChunkId = currentChunk?.id ?? null;
  const { matches, enabledMatchIds, hasMatches, toggleEnabled } = usePhraseMemoryMatches(currentChunkId);
  const [extractingMatch, setExtractingMatch] = useState<PhraseMemoryMatch | null>(null);
  const { runSearchForChunk } = usePhraseMemoryAutoSearch({ auto: false });
  const searchStatus = usePhraseMemoryStore((s) => s.searchStatus);
  const threshold = usePipelineStore((s) => s.config.phraseMemorySimilarityThreshold ?? DEFAULT_THRESHOLD);
  const setConfig = usePipelineStore((s) => s.setConfig);

  const effectiveThreshold = Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD;

  const handleThresholdChange = (value: number) => {
    setConfig((prev) => ({ ...prev, phraseMemorySimilarityThreshold: value }));
  };

  const handleRefresh = async () => {
    if (!currentChunkId) return;
    try {
      await runSearchForChunk(currentChunkId);
    } catch (err) {
      toast.error(t(memorySearchErrorKey(err)));
    }
  };

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-editorial-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-sans uppercase tracking-[0.22em] text-editorial-muted">
            {t('memory.referencesMemorySectionTitle')}
          </p>
          <IconButton
            size="md"
            tone={searchStatus === 'searching' ? 'running' : 'default'}
            title={searchStatus === 'searching' ? t('memory.searching') : t('memory.refreshButton')}
            onClick={() => void handleRefresh()}
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
              className="text-xs font-sans uppercase tracking-[0.28em] text-editorial-muted"
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
      </div>

      {hasMatches ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 custom-scrollbar">
          <p className="text-xs leading-relaxed text-editorial-muted">{t('memory.selectionHint')}</p>
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
          <Layers size={28} className="text-editorial-border" />
          <p className="text-sm font-medium text-editorial-muted">{t('memory.coldStartTitle')}</p>
          <p className="text-xs leading-relaxed text-editorial-muted">{t('memory.coldStartBodyShort')}</p>
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
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(match.targetPhrase);
      setCopied(true);
      toast.success(t('memory.appliedToClipboard'));
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000);
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
          <p className="mb-1 text-xs uppercase tracking-[0.28em] text-editorial-muted">
            {t('memory.sourcePhraseShort')}
          </p>
          <div className="text-sm leading-relaxed text-editorial-charcoal">
            {match.sourcePhrase}
          </div>
        </div>
        <div className="rounded-md bg-editorial-textbox/45 px-3 py-2">
          <p className="mb-1 text-xs uppercase tracking-[0.28em] text-editorial-muted">
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
