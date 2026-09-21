import { useEffect, useState } from 'react';
import { FilePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createDocument } from '../../services/transcriptionService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Dialog, DialogCancelButton, DialogConfirmButton, Select } from '../ui';

interface CreateTranscriptionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Workspace già noto dal chiamante. Se assente, l'utente sceglie da un elenco. */
  workspaceId?: string;
  /** Fonte a cui ancorare il documento (una digitalizzazione della Biblioteca). */
  sourceVersionId?: string | null;
  defaultTitle?: string;
  onCreated: (documentId: string) => void;
}

/** Dialog di creazione documento di trascrizione: crea nel workspace scelto e lo apre subito. */
export function CreateTranscriptionDialog({
  open,
  onClose,
  workspaceId,
  sourceVersionId = null,
  defaultTitle = '',
  onCreated,
}: CreateTranscriptionDialogProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [title, setTitle] = useState(defaultTitle);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setSelectedWorkspaceId((current) => {
      if (workspaceId) return workspaceId;
      if (current && workspaces.some((workspace) => workspace.id === current)) return current;
      return workspaces[0]?.id ?? null;
    });
  }, [open, workspaceId, workspaces, defaultTitle]);

  const close = () => {
    setTitle('');
    onClose();
  };

  const handleCreate = async () => {
    if (!title.trim() || !selectedWorkspaceId) return;
    setCreating(true);
    try {
      const document = await createDocument(selectedWorkspaceId, title.trim(), sourceVersionId);
      close();
      onCreated(document.id);
    } catch (err: unknown) {
      toast.error(t('transcription.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  };

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      title={t('transcription.create')}
      eyebrow={selectedWorkspace?.name ?? t('workspace.noActive')}
      closeLabel={t('common.cancel')}
      icon={<FilePen size={22} />}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-6 md:px-8"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={close}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton
            onClick={() => void handleCreate()}
            disabled={!title.trim() || !selectedWorkspaceId || creating}
          >
            {creating ? t('workspace.saving') : t('transcription.create')}
          </DialogConfirmButton>
        </div>
      }
    >
      <div className="space-y-4">
        {!workspaceId && (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
              {t('projects.chooseWorkspace')}
            </span>
            <Select
              value={selectedWorkspaceId ?? ''}
              onChange={setSelectedWorkspaceId}
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              ariaLabel={t('projects.chooseWorkspace')}
              className="w-full"
            />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
            {t('transcription.titleLabel')}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') close();
            }}
            placeholder={t('transcription.titlePlaceholder')}
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (nuovo documento)
            autoFocus
          />
        </label>
      </div>
    </Dialog>
  );
}
