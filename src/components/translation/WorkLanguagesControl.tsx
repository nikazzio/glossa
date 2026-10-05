import { useState } from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogCancelButton, DialogConfirmButton, IconButton, Tooltip } from '../ui';
import { WorkLanguagesFields } from '../languages/WorkLanguagesFields';
import { useLanguageCatalog } from '../../hooks/useLanguageCatalog';
import { useWorkLanguageSuggestions } from '../../hooks/useWorkLanguageSuggestions';
import { describeLanguageChoice, languageNameOf } from '../../languages/catalog';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { reportUiError } from '../../utils/reportUiError';
import { confirm } from '../../stores/confirmStore';
import { countProjectPhraseRelabels, relabelProjectPhrases } from '../../services/phraseMemoryService';
import { toast } from 'sonner';
import type { LanguageChoice, WorkLanguages } from '../../types';

const sameChoice = (a: LanguageChoice, b: LanguageChoice) =>
  a.code === b.code && a.variety === b.variety && a.note.trim() === b.note.trim();

/**
 * Le lingue dell'opera nella riga in cima allo Studio: la coppia in breve, la
 * nota nel suggerimento; un clic apre la finestra, che salva solo con Conferma.
 */
export function WorkLanguagesControl({ disabledReason }: { disabledReason: string | null }) {
  const { t, i18n } = useTranslation();
  const workLanguages = usePipelineStore((s) => s.workLanguages);
  const updateWorkLanguages = useProjectStore((s) => s.updateWorkLanguages);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? null);
  const catalog = useLanguageCatalog();
  const { usedCodes, bookLanguageCode } = useWorkLanguageSuggestions(catalog, workspaceId, currentProjectId);
  const [draft, setDraft] = useState<WorkLanguages | null>(null);
  const [saving, setSaving] = useState(false);

  // Nella riga solo i nomi; varietà e note stanno nel suggerimento.
  const shortName = (choice: LanguageChoice) => (choice.code ? languageNameOf(catalog, choice.code, i18n.language) : t('workLanguages.notSpecified'));
  const describe = (choice: LanguageChoice) => describeLanguageChoice(catalog, choice, i18n.language) ?? t('workLanguages.notSpecified');
  const sideHint = (label: string, choice: LanguageChoice) =>
    `${label}: ${describe(choice)}${choice.note.trim() ? ` — ${choice.note.trim()}` : ''}`;
  const hint = [
    t('workLanguages.title'),
    sideHint(t('workLanguages.source'), workLanguages.source),
    sideHint(t('workLanguages.target'), workLanguages.target),
  ].join('\n');

  const open = () => {
    // Una partenza vuota si propone con la lingua del libro: resta da confermare.
    const source = !workLanguages.source.code && bookLanguageCode
      ? { ...workLanguages.source, code: bookLanguageCode }
      : workLanguages.source;
    setDraft({ ...workLanguages, source });
  };
  const changed = draft !== null && !(sameChoice(draft.source, workLanguages.source) && sameChoice(draft.target, workLanguages.target));

  const confirmDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (changed) {
        await updateWorkLanguages({
          source: { ...draft.source, note: draft.source.note.trim() },
          target: { ...draft.target, note: draft.target.note.trim() },
        });
      }
      setDraft(null);
    } catch (error: unknown) {
      reportUiError(t('workLanguages.saveFailed'), error);
      return;
    } finally {
      setSaving(false);
    }
    if (currentProjectId) await offerPhraseRelabel(currentProjectId);
  };

  // Anche a lingue invariate: così si allineano frasi salvate prima con altre lingue.
  const offerPhraseRelabel = async (projectId: string) => {
    try {
      const count = await countProjectPhraseRelabels(projectId);
      if (count === 0) return;
      const ok = await confirm({
        title: t('workLanguages.relabelTitle'),
        message: t('workLanguages.relabelMessage', { count }),
        confirmLabel: t('workLanguages.relabelConfirm'),
      });
      if (!ok) return;
      const updated = await relabelProjectPhrases(projectId);
      toast.success(t('workLanguages.relabelDone', { count: updated }));
    } catch (error: unknown) {
      reportUiError(t('workLanguages.relabelFailed'), error);
    }
  };

  return (
    <>
      {/* La coppia si legge, l'icona si clicca: stesso gesto di ogni altro comando della riga. */}
      <Tooltip label={hint} side="bottom" className="min-w-0">
        <span className="block max-w-[min(20vw,16rem)] truncate font-display text-sm italic text-editorial-muted">
          {shortName(workLanguages.source)} → {shortName(workLanguages.target)}
        </span>
      </Tooltip>
      <IconButton size="sm" onClick={open} disabled={Boolean(disabledReason)} tooltipSide="bottom"
        title={disabledReason ? t('transcription.commandBlocked', { command: t('workLanguages.edit'), reason: disabledReason }) : t('workLanguages.edit')}>
        <Languages size={14} />
      </IconButton>
      <Dialog
        open={draft !== null}
        onOpenChange={(isOpen) => { if (!isOpen && !saving) setDraft(null); }}
        title={t('workLanguages.title')}
        closeLabel={t('common.cancel')}
        icon={<Languages size={20} />}
        compact
        widthClassName="max-w-xl"
        closeDisabled={saving}
        footer={
          <div className="flex justify-end gap-2">
            <DialogCancelButton onClick={() => setDraft(null)} disabled={saving}>{t('common.cancel')}</DialogCancelButton>
            <DialogConfirmButton onClick={() => void confirmDraft()} disabled={saving}>
              {saving ? t('workspace.saving') : t('common.confirm')}
            </DialogConfirmButton>
          </div>
        }
      >
        {draft && <WorkLanguagesFields catalog={catalog} value={draft} onChange={setDraft} usedCodes={usedCodes} disabled={saving} />}
      </Dialog>
    </>
  );
}
