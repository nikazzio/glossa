import { BookPlus, Brain, Check, Clipboard, Database, Loader2, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryMatches } from '../../hooks/usePhraseMemoryMatches';
import { useSaveToMemory } from '../../hooks/useSaveToMemory';
import type { PhraseMemoryMatch } from '../../stores/phraseMemoryStore';
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

  const handleSaveToMemory = async () => {
    try {
      await saveToMemory();
      toast.success(t('memory.savedToMemory'));
    } catch {
      toast.error(t('memory.saveToMemoryFailed'));
    }
  };

  const saveButton = (
    <button
      type="button"
      onClick={handleSaveToMemory}
      disabled={isSaving}
      className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:border-editorial-accent/50 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={t('memory.saveToMemoryButton')}
    >
      {isSaving
        ? <Loader2 size={12} className="animate-spin" />
        : <Database size={12} />}
      {isSaving && progress
        ? `${progress.done}/${progress.total}`
        : t('memory.saveToMemoryButton')}
    </button>
  );

  if (!hasMatches) {
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      >
        <Brain size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">
          {t('memory.coldStartTitle')}
        </p>
        <p className="text-xs leading-relaxed text-editorial-muted/70">
          {t('memory.coldStartBody')}
        </p>
        {saveButton}
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
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

      <div className="shrink-0 border-t border-editorial-border px-4 py-3 space-y-2">
        <button
          type="button"
          onClick={() => onRerun(selectedMatches)}
          disabled={selectedMatches.length === 0}
          className="w-full flex items-center justify-center gap-2 rounded-full border border-editorial-accent bg-editorial-accent/10 px-4 py-2 text-sm font-medium text-editorial-accent transition-colors hover:bg-editorial-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('memory.rerunButton')}
        >
          <RefreshCcw size={14} />
          {t('memory.rerunButton')}
        </button>
        <div className="flex justify-center">{saveButton}</div>
      </div>

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

  const handleApply = async () => {
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
    <article className="rounded-2xl border border-editorial-border bg-editorial-bg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            className="h-4 w-4 rounded border-editorial-border accent-editorial-accent"
            aria-label={t('memory.enableMatch')}
          />
          <span className="font-mono text-xs font-bold text-editorial-accent">
            {Math.round(match.score * 100)}%
          </span>
        </div>
        {(match.author ?? match.work) && (
          <span className="text-[10px] text-editorial-muted truncate max-w-[180px]">
            {[match.author, match.work].filter(Boolean).join(' — ')}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-editorial-textbox/40 px-3 py-2 text-xs leading-relaxed text-editorial-ink font-mono">
        {match.sourcePhrase}
      </div>

      <div className="rounded-xl border border-editorial-border/60 bg-editorial-bg px-3 py-2 text-xs leading-relaxed text-editorial-ink">
        {match.targetPhrase}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleApply}
          className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-1 text-[11px] font-medium text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('memory.applyButton')}
        >
          {copied ? <Check size={12} className="text-editorial-success" /> : <Clipboard size={12} />}
          {t('memory.applyButton')}
        </button>
        <button
          type="button"
          onClick={onExtractTerm}
          className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-1 text-[11px] font-medium text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('memory.extractTermButton')}
        >
          <BookPlus size={12} />
          {t('memory.extractTermButton')}
        </button>
      </div>
    </article>
  );
}
