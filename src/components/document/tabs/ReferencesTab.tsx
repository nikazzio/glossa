import { Globe, Layers, Loader2, Minus, Plus, RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryAutoSearch } from '../../../hooks/usePhraseMemoryAutoSearch';
import { usePhraseMemoryMatches } from '../../../hooks/usePhraseMemoryMatches';
import { usePhraseMemoryStore } from '../../../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../../../stores/phraseMemoryStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { classifyError } from '../../../utils/retry';
import { CommandRule, EmptyState, Hint, IconButton } from '../../ui';
import { usePhraseProvenanceLookup } from '../../../hooks/usePhraseProvenanceLookup';
import { ReferenceMatchRow } from './ReferenceMatchRow';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useProjectStore } from '../../../stores/projectStore';
import { reportUiError } from '../../../utils/reportUiError';
import { memoryCircle, orderByCircle } from '../../../utils/memoryCircles';
import { ExtractTermDialog } from '../ExtractTermDialog';
import type { TranslationChunk } from '../../../types';

const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1;
const DEFAULT_THRESHOLD = 0.75;
const THRESHOLD_STEP = 0.01;

// classifyError() drives the pipeline's retry logic too; here we only use it
// to pick which reason to show — a memory search never retries on its own.
const MEMORY_SEARCH_ERROR_KEYS: Partial<Record<ReturnType<typeof classifyError>, string>> = {
  quota_exceeded: 'memory.searchFailedQuota',
  rate_limit: 'memory.searchFailedRateLimit',
  config: 'memory.searchFailedConfig',
  network: 'memory.searchFailedNetwork',
};

function memorySearchErrorKey(error: unknown): string {
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
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? null);
  const searchAllWorkspaces = useWorkspaceStore((s) => s.activeWorkspace?.memorySearchAllWorkspaces ?? false);
  const updateActiveWorkspace = useWorkspaceStore((s) => s.updateActiveWorkspace);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const lookup = usePhraseProvenanceLookup(matches);
  const orderedMatches = useMemo(
    () => orderByCircle(matches, currentProjectId, activeWorkspaceId),
    [matches, currentProjectId, activeWorkspaceId],
  );

  // Il terzo cerchio: la scelta resta del workspace, ma si comanda da qui, dove si vedono i risultati.
  const toggleAllWorkspaces = async () => {
    try {
      await updateActiveWorkspace({ memorySearchAllWorkspaces: !searchAllWorkspaces });
    } catch (err: unknown) {
      reportUiError(t('memory.searchScopeSaveFailed'), err);
    }
  };

  const handleThresholdChange = (value: number) => {
    setConfig((prev) => ({ ...prev, phraseMemorySimilarityThreshold: value }));
  };
  // Un passo di +/- per arrivare preciso dove il cursore salta: arrotondato al centesimo.
  const stepThreshold = (delta: number) => {
    const next = Math.round((effectiveThreshold + delta) * 100) / 100;
    handleThresholdChange(Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, next)));
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
      {/* Una sola riga di comandi: il nome della scheda dice già cosa c'è sotto. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-editorial-border px-4 py-2">
        <Hint label={t('memory.thresholdHint')}>
          <span className="mr-1 text-sm text-editorial-ink">{t('memory.threshold')}</span>
        </Hint>
        <IconButton size="sm" title={t('memory.thresholdDown')} onClick={() => stepThreshold(-THRESHOLD_STEP)}
          disabled={effectiveThreshold <= MIN_THRESHOLD}><Minus size={13} /></IconButton>
        <input
          type="range"
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={THRESHOLD_STEP}
          value={effectiveThreshold}
          onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
          className="min-w-12 flex-1 accent-editorial-accent"
          aria-label={t('memory.threshold')}
        />
        <IconButton size="sm" title={t('memory.thresholdUp')} onClick={() => stepThreshold(THRESHOLD_STEP)}
          disabled={effectiveThreshold >= MAX_THRESHOLD}><Plus size={13} /></IconButton>
        <span className="w-9 text-right font-mono text-xs text-editorial-ink">{effectiveThreshold.toFixed(2)}</span>
        <CommandRule />
        <IconButton
          size="sm"
          tone={searchAllWorkspaces ? 'accent' : 'default'}
          ariaPressed={searchAllWorkspaces}
          title={t(searchAllWorkspaces ? 'memory.searchAllWorkspacesOn' : 'memory.searchAllWorkspacesOff')}
          onClick={() => void toggleAllWorkspaces()}
          disabled={!activeWorkspaceId || searchStatus === 'searching'}
          tooltipSide="left"
        >
          <Globe size={13} />
        </IconButton>
        <IconButton
          size="sm"
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

      {hasMatches ? (
        <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
          <div className="divide-y divide-rule">
            {orderedMatches.map((match) => (
              <ReferenceMatchRow
                key={match.id}
                match={match}
                circle={memoryCircle(match, currentProjectId, activeWorkspaceId)}
                enabled={enabledMatchIds.has(match.id)}
                lookup={lookup}
                onToggle={() => toggleEnabled(match.id)}
                onExtractTerm={() => setExtractingMatch(match)}
              />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={<Layers size={28} />} message={t('memory.noSimilar')} />
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
