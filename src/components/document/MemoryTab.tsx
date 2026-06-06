import { AlertCircle, BookPlus, Brain, Check, Clipboard, Database, Loader2, RefreshCcw, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { usePhraseMemoryMatches } from '../../hooks/usePhraseMemoryMatches';
import { useSaveToMemory } from '../../hooks/useSaveToMemory';
import { usePhraseMemoryStore, type PhraseMemoryMatch } from '../../stores/phraseMemoryStore';
import { IconButton, PillButton, SectionLabel } from '../ui';
import { ExtractTermDialog } from './ExtractTermDialog';

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
  const { saveToMemory, isSaving, progress } = useSaveToMemory();
  const { runSearchForChunk } = usePhraseMemoryAutoSearch({ auto: false });
  const searchStatus = usePhraseMemoryStore((s) => s.searchStatus);

  const handleRefresh = async () => {
    if (!currentChunkId) return;
    try {
      await runSearchForChunk(currentChunkId);
    } catch {
      toast.error(t('memory.searchFailed'));
    }
  };

  const handleSaveToMemory = async () => {
    try {
      const savedCount = await saveToMemory(currentChunkId ? [currentChunkId] : []);
      if (savedCount === 0) {
        toast.message(t('memory.nothingToSave'));
        return;
      }
      toast.success(t('memory.savedToMemory', { count: savedCount }));
    } catch {
      toast.error(t('memory.saveToMemoryFailed'));
    }
  };

  const searchStatusRow = searchStatus === 'searching' ? (
    <StatusRow icon={<Loader2 size={13} className="animate-spin" />} label={t('memory.searching')} />
  ) : searchStatus === 'error' ? (
    <StatusRow icon={<AlertCircle size={13} />} label={t('memory.searchFailed')} tone="error" />
  ) : null;
  const saveStatusRow = isSaving && progress ? (
    <StatusRow
      icon={<Loader2 size={13} className="animate-spin" />}
      label={`${t('memory.saveToMemoryButton')} ${progress.done}/${progress.total}`}
    />
  ) : null;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-editorial-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={Brain} label={t('document.insightsTabMemory')} />
          <div className="flex items-center gap-1">
            <IconButton
              size="md"
              tone={selectedMatches.length > 0 ? 'accent' : 'default'}
              title={t('memory.rerunButton')}
              onClick={() => onRerun(selectedMatches)}
              disabled={selectedMatches.length === 0}
              tooltipSide="left"
            >
              <RotateCcw size={13} />
            </IconButton>
            <IconButton
              size="md"
              title={t('memory.saveToMemoryButton')}
              onClick={() => void handleSaveToMemory()}
              disabled={isSaving || !currentChunkId}
              tooltipSide="left"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
            </IconButton>
            <IconButton
              size="md"
              title={t('memory.refreshButton')}
              onClick={() => void handleRefresh()}
              disabled={!currentChunkId || searchStatus === 'searching'}
              tooltipSide="left"
            >
              <RefreshCcw size={13} />
            </IconButton>
          </div>
        </div>
        {searchStatusRow}
        {saveStatusRow}
        <p className="text-xs leading-relaxed text-editorial-muted">
          {hasMatches ? t('memory.selectionHint') : t('memory.coldStartBody')}
        </p>
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

function StatusRow({
  icon,
  label,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  tone?: 'neutral' | 'error';
}) {
  const colorClass = tone === 'error'
    ? 'border-editorial-accent/35 bg-editorial-accent/8 text-editorial-accent'
    : 'border-editorial-border bg-editorial-textbox/35 text-editorial-muted';
  return (
    <div className={`flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] ${colorClass}`}>
      {icon}
      {label}
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
    <article className={`space-y-3 rounded-lg border bg-editorial-bg p-4 transition-colors ${enabled ? 'border-editorial-accent/70' : 'border-editorial-border'}`}>
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
            {t('memory.enableMatch')}
          </span>
        </label>
        <span className="shrink-0 font-mono text-xs font-bold text-editorial-accent">
          {Math.round(match.score * 100)}%
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-editorial-muted">
          {t('memory.sourcePhraseLabel')}
        </p>
        <div className="rounded-md bg-editorial-textbox/45 px-3 py-2 font-mono text-xs leading-relaxed text-editorial-ink">
          {match.sourcePhrase}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-editorial-muted">
          {t('glossary.translation')}
        </p>
        <div className="rounded-md border border-editorial-border/60 bg-editorial-bg px-3 py-2 text-xs leading-relaxed text-editorial-ink">
          {match.targetPhrase}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PillButton
          onClick={() => void handleCopy()}
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          {copied ? <Check size={13} className="text-editorial-success" /> : <Clipboard size={13} />}
          {t('memory.applyButton')}
        </PillButton>
        <PillButton
          onClick={onExtractTerm}
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          <BookPlus size={13} />
          {t('memory.extractTermButton')}
        </PillButton>
      </div>
    </article>
  );
}
