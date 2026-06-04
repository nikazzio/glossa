import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { listGlossaries, addGlossaryEntry } from '../../services/glossaryService';
import { extractTermFromPhrase } from '../../services/llmService';
import { usePipelineStore } from '../../stores/pipelineStore';
import type { Glossary } from '../../types';
import { generateId } from '../../utils';

interface ExtractTermDialogProps {
  sourcePhrase: string;
  targetPhrase: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExtractTermDialog({ sourcePhrase, targetPhrase, onClose, onSuccess }: ExtractTermDialogProps) {
  const { t } = useTranslation();
  const stageProvider = usePipelineStore((s) => s.config.stages[0]?.provider ?? 'openai');
  const stageModel = usePipelineStore((s) => s.config.stages[0]?.model ?? 'gpt-4o');
  const assignedGlossaryId = usePipelineStore((s) => s.config.assignedGlossaryId);

  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState(targetPhrase);
  const [notes, setNotes] = useState('');
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(null);
  const [glossaries, setGlossaries] = useState<Glossary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const [gl, suggested] = await Promise.all([
          listGlossaries(),
          extractTermFromPhrase(
            sourcePhrase,
            stageProvider,
            stageModel,
          ).catch(() => ({ term: sourcePhrase.split(' ').slice(0, 3).join(' '), confidence: 0 })),
        ]);
        if (cancelled) return;
        setGlossaries(gl);
        setTerm(suggested.term);
        if (assignedGlossaryId) setSelectedGlossaryId(assignedGlossaryId);
      } catch {
        if (!cancelled) toast.error(t('errors.loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void init();
    return () => { cancelled = true; };
  }, [sourcePhrase, stageProvider, stageModel, assignedGlossaryId, t]);

  const handleConfirm = async () => {
    if (!selectedGlossaryId || !term.trim()) return;
    setIsSaving(true);
    try {
      await addGlossaryEntry(selectedGlossaryId, {
        id: generateId('gle'),
        term: term.trim(),
        translation: translation.trim(),
        notes: notes.trim() || undefined,
      });
      toast.success(t('memory.termExtracted'));
      onSuccess();
      onClose();
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extract-term-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-editorial-border bg-editorial-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-editorial-border px-6 py-4">
          <h2 id="extract-term-title" className="font-display text-base italic text-editorial-ink">
            {t('memory.extractTermTitle')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('memory.sourcePhraseLabel')}
            </label>
            <div className="rounded-xl bg-editorial-textbox/40 px-3 py-2 text-xs text-editorial-muted font-mono leading-relaxed">
              {sourcePhrase}
            </div>
          </div>

          <div>
            <label htmlFor="extract-term-input"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('memory.termLabel')}
            </label>
            <input id="extract-term-input" type="text" value={isLoading ? '…' : term}
              onChange={(e) => setTerm(e.target.value)} disabled={isLoading}
              aria-label={t('memory.termLabel')}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-50" />
          </div>

          <div>
            <label htmlFor="extract-translation-input"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('glossary.translation')}
            </label>
            <input id="extract-translation-input" type="text" value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent" />
          </div>

          <div>
            <label htmlFor="extract-notes-input"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('glossary.notes')} ({t('common.optional')})
            </label>
            <input id="extract-notes-input" type="text" value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent" />
          </div>

          <div>
            <label htmlFor="extract-glossary-select"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('glossary.selectGlossary')}
            </label>
            <select id="extract-glossary-select" value={selectedGlossaryId ?? ''}
              onChange={(e) => setSelectedGlossaryId(e.target.value || null)}
              aria-label={t('glossary.selectGlossary')}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
              <option value="">{t('glossary.noGlossarySelected')}</option>
              {glossaries.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-editorial-border px-6 py-4">
          <button type="button" onClick={onClose} aria-label={t('common.cancel')}
            className="rounded-full border border-editorial-border px-4 py-2 text-sm text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={handleConfirm}
            disabled={!selectedGlossaryId || !term.trim() || isSaving}
            aria-label={t('common.confirm')}
            className="rounded-full border border-editorial-accent bg-editorial-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-editorial-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40">
            {isSaving ? '…' : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
