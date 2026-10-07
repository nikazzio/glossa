import { Brain, CircleCheck, Database, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMemoryExtractionDraft } from '../../../hooks/useMemoryExtractionDraft';
import { confirm as confirmDialog } from '../../../stores/confirmStore';
import { EmptyState, FIELD_CLASSNAME, IconButton, Spinner } from '../../ui';
import { useLanguageNames } from '../../../hooks/useLanguageLabel';
import { UNDETERMINED_LANGUAGE } from '../../../languages/catalog';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { PhraseLine } from './ReferenceMatchRow';
import type { PhraseCandidateDraft } from '../../../stores/phraseMemoryDraftStore';
import type { LanguageChoice, TranslationChunk } from '../../../types';

interface MemoryTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

/** La memoria del frammento: le coppie già salvate (si tolgono una a una) e
 *  quelle nuove, estratte o scritte a mano, da spuntare e aggiungere. Si apre
 *  solo a traduzione verificata: lo decide la sottolinguetta. */
export function MemoryTab({ panelId, labelledBy, currentChunk }: MemoryTabProps) {
  const { t } = useTranslation();
  const {
    status, candidates, canExtract, isLoadingSaved, extract, addManualCandidate,
    updateCandidate, toggleAccepted, confirm, removeSaved, savedCount, savedLoadFailed,
  } = useMemoryExtractionDraft(currentChunk);
  const busy = status === 'extracting' || status === 'saving';

  const handleExtract = async () => {
    try {
      await extract();
    } catch {
      toast.error(t('memory.extractFailed'));
    }
  };

  const handleConfirm = async () => {
    try {
      const added = await confirm();
      if (added === 0) {
        toast.message(t('memory.nothingToSave'));
        return;
      }
      toast.success(t('memory.savedToMemory', { count: added }));
    } catch {
      toast.error(t('memory.saveToMemoryFailed'));
    }
  };

  const handleRemove = async (candidate: PhraseCandidateDraft) => {
    const ok = await confirmDialog({
      title: t('memory.removeConfirmTitle'),
      message: t('memory.removeConfirmMessage'),
      confirmLabel: t('memory.removeFromMemory'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeSaved(candidate);
    } catch {
      toast.error(t('memory.removeFailed'));
    }
  };

  const hasNewChecked = candidates.some(
    (c) => c.origin !== 'saved' && c.accepted && c.sourcePhrase.trim() && c.targetPhrase.trim(),
  );
  const addLabel = t('memory.addCheckedToMemory');

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-editorial-border px-4 py-3">
        <IconButton size="md" title={t('memory.extractButton')} onClick={() => void handleExtract()} disabled={!canExtract}>
          {status === 'extracting' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
        </IconButton>
        <IconButton size="md" title={t('memory.addPair')} onClick={addManualCandidate} disabled={busy}>
          <Plus size={13} />
        </IconButton>
        <span className="font-display text-sm italic text-editorial-ink tabular-nums">{savedCount}</span>
        <span className="text-xs text-editorial-muted">{t('memory.inMemoryCount', { count: savedCount })}</span>
        <span className="ml-auto">
          <IconButton
            size="md"
            title={hasNewChecked ? addLabel : t('transcription.commandBlocked', { command: addLabel, reason: t('memory.reasonNoNewChecked') })}
            onClick={() => void handleConfirm()}
            disabled={!hasNewChecked || busy}
          >
            {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          </IconButton>
        </span>
      </div>

      {savedLoadFailed && (
        <p role="alert" className="shrink-0 px-4 pt-3 text-xs text-editorial-danger">{t('memory.savedLoadFailed')}</p>
      )}

      {isLoadingSaved ? (
        <Spinner size={20} label={t('memory.loadingMemories')} className="flex flex-1 items-center justify-center gap-2 text-sm text-editorial-muted" />
      ) : candidates.length === 0 ? (
        <EmptyState icon={<Brain size={28} />} message={t('memory.chunkEmpty')} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
          <div className="divide-y divide-rule">
            {candidates.map((candidate) => (
              candidate.origin === 'saved' ? (
                <SavedPairRow key={candidate.id} candidate={candidate} onRemove={() => void handleRemove(candidate)} />
              ) : (
                <NewPairRow
                  key={candidate.id}
                  candidate={candidate}
                  disabled={busy}
                  onToggle={() => toggleAccepted(candidate.id)}
                  onChange={(changes) => updateCandidate(candidate.id, changes)}
                />
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Lingue dell'opera per il margine delle righe: codice breve, nome e ruolo nel suggerimento. */
function usePairLanguages() {
  const { t } = useTranslation();
  const languageNames = useLanguageNames();
  const workLanguages = usePipelineStore((s) => s.workLanguages);
  const side = (choice: LanguageChoice, role: string) => {
    const value = choice.code ?? UNDETERMINED_LANGUAGE;
    return { code: value, label: languageNames.describe(value, choice.variety), role };
  };
  return {
    source: side(workLanguages.source, t('memory.reference.original')),
    target: side(workLanguages.target, t('memory.reference.translation')),
  };
}

// Stessa forma dei Riferimenti: originale in carattere da libro, traduzione sotto, lingua a margine.
function SavedPairRow({ candidate, onRemove }: { candidate: PhraseCandidateDraft; onRemove: () => void }) {
  const { t } = useTranslation();
  const languages = usePairLanguages();
  return (
    <div className="flex items-start gap-2.5 py-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="text-xs text-editorial-success">{t('memory.inMemoryBadge')}</span>
        <PhraseLine {...languages.source}>
          <p className="font-display text-base leading-snug text-editorial-charcoal">{candidate.sourcePhrase}</p>
        </PhraseLine>
        <PhraseLine {...languages.target}>
          <p className="text-sm leading-snug text-editorial-ink">{candidate.targetPhrase}</p>
        </PhraseLine>
      </div>
      <IconButton size="sm" title={t('memory.removeFromMemory')} onClick={onRemove} className="shrink-0">
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

interface NewPairRowProps {
  candidate: PhraseCandidateDraft;
  disabled: boolean;
  onToggle: () => void;
  onChange: (changes: Partial<Pick<PhraseCandidateDraft, 'sourcePhrase' | 'targetPhrase'>>) => void;
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function NewPairRow({ candidate, disabled, onToggle, onChange }: NewPairRowProps) {
  const { t } = useTranslation();
  const languages = usePairLanguages();
  return (
    <div className="flex items-start gap-2.5 py-3">
      <IconButton
        size="sm"
        tone={candidate.accepted ? 'accent' : 'default'}
        ariaPressed={candidate.accepted}
        title={t('memory.acceptCandidateLabel')}
        onClick={onToggle}
        disabled={disabled}
        className="shrink-0"
      >
        <CircleCheck size={14} />
      </IconButton>
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="block text-xs text-editorial-muted">
          {candidate.origin === 'ai' ? <span className="font-mono text-editorial-ink">{Math.round(candidate.confidence * 100)}%</span> : t('memory.manualPair')}
        </span>
        <PhraseLine {...languages.source}>
          <textarea
            ref={autoResizeTextarea}
            rows={1}
            value={candidate.sourcePhrase}
            disabled={disabled}
            aria-label={t('memory.sourcePhraseLabel')}
            placeholder={t('memory.manualSourcePlaceholder')}
            onChange={(e) => { onChange({ sourcePhrase: e.target.value }); autoResizeTextarea(e.target); }}
            className={`${FIELD_CLASSNAME} resize-none overflow-hidden px-2 py-1 font-display text-base leading-snug text-editorial-charcoal`}
          />
        </PhraseLine>
        <PhraseLine {...languages.target}>
          <textarea
            ref={autoResizeTextarea}
            rows={1}
            value={candidate.targetPhrase}
            disabled={disabled}
            aria-label={t('glossary.translation')}
            placeholder={t('memory.manualTargetPlaceholder')}
            onChange={(e) => { onChange({ targetPhrase: e.target.value }); autoResizeTextarea(e.target); }}
            className={`${FIELD_CLASSNAME} resize-none overflow-hidden px-2 py-1 leading-snug`}
          />
        </PhraseLine>
      </div>
    </div>
  );
}
