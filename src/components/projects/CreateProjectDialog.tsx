import { useEffect, useState } from 'react';
import { BookOpenText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Dialog, DialogCancelButton, DialogConfirmButton, Select } from '../ui';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Workspace già noto dal chiamante (es. pagina di un workspace aperto). Se assente, l'utente sceglie da un elenco — mai dedotto da un residuo di navigazione. */
  workspaceId?: string;
}

/** Dialog di creazione progetto: crea nel workspace scelto e lo apre subito. */
export function CreateProjectDialog({ open, onClose, workspaceId }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createAndOpen = useProjectStore((s) => s.createAndOpen);

  const [name, setName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setSelectedWorkspaceId(workspaceId ?? workspaces[0]?.id ?? null);
  }, [open, workspaceId, workspaces]);

  const close = () => {
    setName('');
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim() || !selectedWorkspaceId) return;
    setCreating(true);
    try {
      await createAndOpen(name.trim(), selectedWorkspaceId);
      close();
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
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
      title={t('projects.create')}
      eyebrow={selectedWorkspace?.name ?? t('workspace.noActive')}
      closeLabel={t('common.cancel')}
      icon={<BookOpenText size={22} />}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-6 md:px-8"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={close}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton onClick={() => void handleCreate()} disabled={!name.trim() || !selectedWorkspaceId || creating}>
            {creating ? t('workspace.saving') : t('projects.create')}
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
            {t('workspace.newBookCard')}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') close();
            }}
            placeholder={t('projects.namePlaceholder')}
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (nuovo progetto)
            autoFocus
          />
        </label>
      </div>
    </Dialog>
  );
}
