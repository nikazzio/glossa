import { useState } from 'react';
import { BookOpenText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Dialog, DialogCancelButton, DialogConfirmButton } from '../ui';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Dialog di creazione progetto: crea nel workspace attivo e lo apre subito. */
export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const createAndOpen = useProjectStore((s) => s.createAndOpen);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const close = () => {
    setName('');
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createAndOpen(name.trim());
      close();
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      title={t('projects.create')}
      eyebrow={activeWorkspace?.name ?? t('workspace.noActive')}
      closeLabel={t('common.cancel')}
      icon={<BookOpenText size={22} />}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-6 md:px-8"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={close}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton onClick={() => void handleCreate()} disabled={!name.trim() || creating}>
            {creating ? t('workspace.saving') : t('projects.create')}
          </DialogConfirmButton>
        </div>
      }
    >
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
    </Dialog>
  );
}
