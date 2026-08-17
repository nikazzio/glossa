import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, FolderInput, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogCancelButton,
  DialogConfirmButton,
  DialogDangerButton,
  Select,
} from '../ui';
import { workspaceContents, type WorkspaceContents, type WorkspaceDisposal } from '../../services/workspaceService';
import type { Workspace } from '../../types';

/**
 * Eliminare un workspace: prima si dice cosa c'è dentro, poi si decide cosa
 * farne (#213).
 *
 * **Una scelta sola per tutto**, non una per oggetto: su un workspace con venti
 * documenti la seconda strada è un interrogatorio. Prima il comando si rifiutava
 * e basta — «ci sono dei progetti» — lasciando l'utente senza una via d'uscita
 * che non fosse svuotare tutto a mano.
 *
 * Le opere della Biblioteca non compaiono fra le scelte: si scollegano e
 * restano dove sono, perché possono essere di più workspace insieme.
 */
export function WorkspaceDisposalDialog({
  open,
  workspace,
  others,
  onClose,
  onConfirm,
}: {
  open: boolean;
  workspace: Workspace;
  /** Gli altri workspace, dove il contenuto può andare. */
  others: Workspace[];
  onClose: () => void;
  onConfirm: (disposal: WorkspaceDisposal) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [contents, setContents] = useState<WorkspaceContents | null>(null);
  const [target, setTarget] = useState<string>(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  // `t` e i richiami del genitore cambiano identità a ogni render: dentro le
  // dipendenze rilancerebbero l'effetto all'infinito, azzerando i conteggi
  // appena letti.
  const latest = useRef({ t, onClose, others });
  latest.current = { t, onClose, others };

  useEffect(() => {
    if (!open) return;
    setContents(null);
    setTarget(latest.current.others[0]?.id ?? '');
    // Se il conteggio non riesce, il dialogo resterebbe fermo su «carico» per
    // sempre: si dice cos'è successo e si chiude, invece di far aspettare una
    // risposta che non arriva.
    void workspaceContents(workspace.id)
      .then(setContents)
      .catch((error: unknown) => {
        toast.error(latest.current.t('workspace.disposal.contentsFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
        latest.current.onClose();
      });
  }, [open, workspace.id]);

  const owned = contents
    ? contents.projects + contents.glossaries + contents.phrases + contents.transcriptions
    : 0;
  const empty = contents !== null && owned === 0;

  const run = async (disposal: WorkspaceDisposal) => {
    setBusy(true);
    try {
      await onConfirm(disposal);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('workspace.disposal.title', { name: workspace.name })}
      eyebrow={t('workspace.disposal.eyebrow')}
      closeLabel={t('settings.close')}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-5"
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={onClose}>{t('common.cancel')}</DialogCancelButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {contents === null ? (
          <p className="text-sm text-editorial-muted">{t('common.loading')}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-editorial-ink [text-wrap:pretty]">
              {empty
                ? t('workspace.disposal.emptyMessage')
                : t('workspace.disposal.message', {
                    projects: contents.projects,
                    glossaries: contents.glossaries,
                    phrases: contents.phrases,
                    transcriptions: contents.transcriptions,
                  })}
            </p>

            {contents.linkedSources > 0 && (
              <p className="text-xs leading-relaxed text-editorial-muted">
                {t('workspace.disposal.sourcesStay', { count: contents.linkedSources })}
              </p>
            )}

            {!empty && others.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-editorial-border/60 pt-4">
                <div className="flex items-center gap-2 text-xs font-medium text-editorial-ink">
                  <span className="text-editorial-accent"><FolderInput size={13} /></span>
                  <span>{t('workspace.disposal.moveLabel')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={target}
                    onChange={setTarget}
                    className="flex-1"
                    ariaLabel={t('workspace.disposal.moveLabel')}
                    options={others.map((candidate) => ({
                      value: candidate.id,
                      label: candidate.name,
                    }))}
                  />
                  <DialogConfirmButton
                    onClick={() => void run({ kind: 'moveTo', workspaceId: target })}
                    disabled={busy || !target}
                  >
                    {t('workspace.disposal.moveConfirm')}
                  </DialogConfirmButton>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-editorial-border/60 pt-4">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-editorial-warning">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {empty
                  ? t('workspace.disposal.deleteEmptyWarning')
                  : t('workspace.disposal.deleteWarning')}
              </p>
              <DialogDangerButton
                onClick={() => void run({ kind: 'deleteEverything' })}
                disabled={busy}
                className="self-start"
              >
                <Trash2 size={13} />
                {empty
                  ? t('workspace.disposal.deleteEmptyConfirm')
                  : t('workspace.disposal.deleteConfirm')}
              </DialogDangerButton>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
