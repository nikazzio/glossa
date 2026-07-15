import { Brain, Database, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMemoryExtractionDraft } from '../../../hooks/useMemoryExtractionDraft';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { listPhraseMemoryEntries } from '../../../services/phraseMemoryService';
import { IconButton, SectionLabel } from '../../ui';
import type { PhraseCandidateDraft } from '../../../stores/phraseMemoryDraftStore';
import type { TranslationChunk } from '../../../types';

interface MemoryTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

export function MemoryTab({ panelId, labelledBy, currentChunk }: MemoryTabProps) {
  const { t } = useTranslation();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const [chunkMemoryCount, setChunkMemoryCount] = useState<number | null>(null);
  const {
    status, candidates, canExtract, extract, addManualCandidate,
    updateCandidate, toggleAccepted, removeCandidate, confirm,
  } = useMemoryExtractionDraft(currentChunk);

  const currentChunkId = currentChunk?.id ?? null;

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

  const handleExtract = async () => {
    try {
      await extract();
    } catch {
      toast.error(t('memory.extractFailed'));
    }
  };

  const handleConfirm = async () => {
    try {
      const savedCount = await confirm();
      if (savedCount === 0) {
        toast.message(t('memory.nothingToSave'));
        return;
      }
      if (activeWorkspace && currentChunkId) {
        const entries = await listPhraseMemoryEntries(activeWorkspace.id);
        setChunkMemoryCount(entries.filter((e) => e.chunkId === currentChunkId).length);
      }
      toast.success(t('memory.savedToMemory', { count: savedCount }));
    } catch {
      toast.error(t('memory.saveToMemoryFailed'));
    }
  };

  const isReviewing = status === 'reviewing' || status === 'saving';
  const hasAcceptedCandidate = candidates.some((c) => c.accepted && c.sourcePhrase.trim() && c.targetPhrase.trim());

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-editorial-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={Brain} label={t('document.insightsTabMemory')} />
          <IconButton
            size="md"
            title={!currentChunk?.translationLocked ? t('memory.extractDisabledLockHint') : t('memory.extractButton')}
            onClick={() => void handleExtract()}
            disabled={!canExtract}
            tooltipSide="left"
          >
            {status === 'extracting' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
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

      {isReviewing ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 custom-scrollbar">
          <p className="text-xs leading-relaxed text-editorial-muted">
            {candidates.length > 0 ? t('memory.reviewHint') : t('memory.extractEmptyResult')}
          </p>
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onToggle={() => toggleAccepted(candidate.id)}
              onChange={(changes) => updateCandidate(candidate.id, changes)}
              onRemove={() => removeCandidate(candidate.id)}
            />
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={addManualCandidate}
              className="text-xs font-medium text-editorial-accent hover:underline"
            >
              {t('memory.addManualPairButton')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!hasAcceptedCandidate || status === 'saving'}
              className="rounded-md bg-editorial-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {status === 'saving'
                ? <Loader2 size={13} className="mx-auto animate-spin" />
                : t('memory.confirmSaveButton')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Brain size={28} className="text-editorial-border" />
          <p className="text-sm font-medium text-editorial-muted">
            {!currentChunk?.translationLocked ? t('memory.extractDisabledLockHint') : t('memory.coldStartTitle')}
          </p>
        </div>
      )}
    </div>
  );
}

interface CandidateCardProps {
  candidate: PhraseCandidateDraft;
  onToggle: () => void;
  onChange: (changes: Partial<Pick<PhraseCandidateDraft, 'sourcePhrase' | 'targetPhrase'>>) => void;
  onRemove: () => void;
}

function CandidateCard({ candidate, onToggle, onChange, onRemove }: CandidateCardProps) {
  const { t } = useTranslation();
  return (
    <article className={`space-y-2 rounded-lg border bg-editorial-bg p-3 transition-colors ${candidate.accepted ? 'border-editorial-accent/70' : 'border-editorial-border'}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-w-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={candidate.accepted}
            onChange={onToggle}
            className="h-4 w-4 shrink-0 rounded border-editorial-border accent-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('memory.acceptCandidateLabel')}
          />
          {candidate.origin === 'ai' && (
            <span className="shrink-0 font-mono text-xs font-bold text-editorial-accent">
              {Math.round(candidate.confidence * 100)}%
            </span>
          )}
        </label>
        <IconButton size="sm" title={t('memory.removeCandidateButton')} onClick={onRemove} tooltipSide="left">
          <Trash2 size={13} />
        </IconButton>
      </div>
      <input
        type="text"
        value={candidate.sourcePhrase}
        onChange={(e) => onChange({ sourcePhrase: e.target.value })}
        placeholder={t('memory.manualSourcePlaceholder')}
        className="w-full rounded-md bg-editorial-textbox/45 px-3 py-2 text-sm text-editorial-charcoal outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      />
      <input
        type="text"
        value={candidate.targetPhrase}
        onChange={(e) => onChange({ targetPhrase: e.target.value })}
        placeholder={t('memory.manualTargetPlaceholder')}
        className="w-full rounded-md bg-editorial-textbox/45 px-3 py-2 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      />
    </article>
  );
}
