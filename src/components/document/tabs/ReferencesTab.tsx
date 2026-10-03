import { BookPlus, CircleCheck, Layers, Loader2, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryAutoSearch } from '../../../hooks/usePhraseMemoryAutoSearch';
import { usePhraseMemoryMatches } from '../../../hooks/usePhraseMemoryMatches';
import { usePhraseMemoryStore } from '../../../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../../../stores/phraseMemoryStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { classifyError } from '../../../utils/retry';
import { CopyButton, EmptyState, IconButton, PanelSection, SettingRow } from '../../ui';
import { PhraseProvenance } from '../../library/PhraseProvenance';
import { usePhraseProvenanceLookup, type PhraseProvenanceLookup } from '../../../hooks/usePhraseProvenanceLookup';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
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
  const lookup = usePhraseProvenanceLookup(matches);

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
      <div className="shrink-0 border-b border-editorial-border px-4 py-4">
        <PanelSection
          icon={Layers}
          label={t('memory.referencesMemorySectionTitle')}
          hint={t('memory.selectionHint')}
          actions={
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
          }
        >
          <SettingRow label={t('memory.similarityThreshold')}>
            <input
              type="range"
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              step="0.01"
              value={effectiveThreshold}
              onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
              className="w-32 accent-editorial-accent"
              aria-label={t('memory.similarityThreshold')}
            />
            <span className="w-10 text-right font-mono text-xs text-editorial-ink">{effectiveThreshold.toFixed(2)}</span>
          </SettingRow>
        </PanelSection>
      </div>

      {hasMatches ? (
        <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
          <div className="divide-y divide-rule">
            {matches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                enabled={enabledMatchIds.has(match.id)}
                lookup={lookup}
                currentWorkspaceId={activeWorkspaceId}
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

interface MatchRowProps {
  match: PhraseMemoryMatch;
  enabled: boolean;
  lookup: PhraseProvenanceLookup;
  currentWorkspaceId: string | null;
  onToggle: () => void;
  onExtractTerm: () => void;
}

function MatchRow({ match, enabled, lookup, currentWorkspaceId, onToggle, onExtractTerm }: MatchRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 py-3">
      <IconButton
        size="sm"
        tone={enabled ? 'accent' : 'default'}
        ariaPressed={enabled}
        title={t('memory.useInTranslation')}
        onClick={onToggle}
        className="shrink-0"
      >
        <CircleCheck size={14} />
      </IconButton>
      <div className="min-w-0 flex-1 space-y-2">
        <span className="font-mono text-xs text-editorial-muted">{Math.round(match.score * 100)}%</span>
        <p className="text-sm leading-relaxed text-editorial-charcoal">{match.sourcePhrase}</p>
        <p className="text-sm leading-relaxed text-editorial-ink">{match.targetPhrase}</p>
        <PhraseProvenance
          workspaceId={match.workspaceId}
          projectId={match.projectId}
          chunkId={match.chunkId}
          lookup={lookup}
          currentWorkspaceId={currentWorkspaceId}
        />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <CopyButton text={match.targetPhrase} size="sm" />
        <IconButton size="sm" title={t('memory.extractTermButton')} onClick={onExtractTerm} tooltipSide="left">
          <BookPlus size={13} />
        </IconButton>
      </div>
    </div>
  );
}
