import { Brain, Database, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMemoryExtractionDraft } from '../../../hooks/useMemoryExtractionDraft';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { listPhraseMemoryEntries } from '../../../services/phraseMemoryService';
import { IconButton } from '../../ui';
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
  const [isCountLoading, setIsCountLoading] = useState(false);
  const {
    status, candidates, canExtract, isLoadingSaved, extract, addManualCandidate,
    updateCandidate, toggleAccepted, confirm,
  } = useMemoryExtractionDraft(currentChunk);
  const isLocked = Boolean(currentChunk?.translationLocked);

  const currentChunkId = currentChunk?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadCount(): Promise<void> {
      if (!activeWorkspace || !currentChunkId) {
        if (!cancelled) { setChunkMemoryCount(null); setIsCountLoading(false); }
        return;
      }
      setIsCountLoading(true);
      try {
        const entries = await listPhraseMemoryEntries(activeWorkspace.id);
        if (!cancelled) {
          setChunkMemoryCount(entries.filter((e) => e.chunkId === currentChunkId).length);
        }
      } catch {
        if (!cancelled) setChunkMemoryCount(null);
      } finally {
        if (!cancelled) setIsCountLoading(false);
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

  const hasAcceptedCandidate = candidates.some((c) => c.accepted && c.sourcePhrase.trim() && c.targetPhrase.trim());
  const canUpdateMemory = hasAcceptedCandidate && status !== 'saving' && status !== 'extracting' && isLocked;
  const showList = status !== 'idle';

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-editorial-border px-4 py-3">
        <div className="flex items-center gap-2">
          <IconButton
            size="md"
            title={!currentChunk?.translationLocked ? t('memory.extractDisabledLockHint') : t('memory.extractButton')}
            onClick={() => void handleExtract()}
            disabled={!canExtract}
            tooltipSide="right"
          >
            {status === 'extracting' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
          </IconButton>
          {isCountLoading ? (
            <Loader2 size={14} className="animate-spin text-editorial-muted" aria-label={t('memory.loadingMemories')} />
          ) : chunkMemoryCount !== null && (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-editorial-success/35 bg-editorial-success/10 font-display text-sm italic text-editorial-success">
                {chunkMemoryCount}
              </div>
              <p className="text-xs text-editorial-muted">{t('memory.memoriesLabel')}</p>
            </>
          )}
          {showList && (
            <div className="ml-auto">
              <IconButton
                size="md"
                title={t('memory.confirmSaveButton')}
                onClick={() => void handleConfirm()}
                disabled={!canUpdateMemory}
                tooltipSide="left"
              >
                {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {showList ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 custom-scrollbar">
          <fieldset disabled={status === 'extracting' || status === 'saving'} className="m-0 min-w-0 space-y-3 border-0 p-0">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onToggle={() => toggleAccepted(candidate.id)}
                onChange={(changes) => updateCandidate(candidate.id, changes)}
              />
            ))}
            <button
              type="button"
              onClick={addManualCandidate}
              disabled={!isLocked}
              className="text-xs font-medium text-editorial-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('memory.addManualPairButton')}
            </button>
          </fieldset>
        </div>
      ) : isLoadingSaved ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Loader2 size={28} className="animate-spin text-editorial-border" />
          <p className="text-sm font-medium text-editorial-muted">{t('memory.loadingMemories')}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Brain size={28} className="text-editorial-border" />
          {!currentChunk?.translationLocked && (
            <p className="text-sm font-medium text-editorial-muted">{t('memory.extractDisabledLockHint')}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface CandidateCardProps {
  candidate: PhraseCandidateDraft;
  onToggle: () => void;
  onChange: (changes: Partial<Pick<PhraseCandidateDraft, 'sourcePhrase' | 'targetPhrase'>>) => void;
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function CandidateCard({ candidate, onToggle, onChange }: CandidateCardProps) {
  const { t } = useTranslation();
  return (
    <article className={`space-y-3 rounded-lg border bg-editorial-bg p-3 transition-colors ${candidate.accepted ? 'border-editorial-accent/70' : 'border-editorial-border'}`}>
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
        {candidate.origin === 'saved' && (
          <span className="shrink-0 text-xs font-medium text-editorial-muted">
            {t('memory.savedCandidateLabel')}
          </span>
        )}
      </label>
      <div className="rounded-md bg-editorial-textbox/45 px-3 py-2">
        <p className="mb-1 text-[10px] uppercase tracking-[0.28em] text-editorial-muted">
          {t('memory.sourcePhraseLabel')}
        </p>
        <textarea
          ref={autoResizeTextarea}
          rows={1}
          value={candidate.sourcePhrase}
          onChange={(e) => { onChange({ sourcePhrase: e.target.value }); autoResizeTextarea(e.target); }}
          className="w-full resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-editorial-charcoal outline-none"
        />
      </div>
      <div className="rounded-md bg-editorial-textbox/45 px-3 py-2">
        <p className="mb-1 text-[10px] uppercase tracking-[0.28em] text-editorial-muted">
          {t('glossary.translation')}
        </p>
        <textarea
          ref={autoResizeTextarea}
          rows={1}
          value={candidate.targetPhrase}
          onChange={(e) => { onChange({ targetPhrase: e.target.value }); autoResizeTextarea(e.target); }}
          className="w-full resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-editorial-ink outline-none"
        />
      </div>
    </article>
  );
}
