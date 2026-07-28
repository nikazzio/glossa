import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Dialog, DialogCancelButton, DialogConfirmButton } from '../ui';
import { DEFAULT_WORKSPACE_ICON, type WorkspaceIconKey } from '../../workspaceIdentity';
import { WorkspaceIconPicker } from './WorkspaceIdentity';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkspaceDialog({ open, onClose }: CreateWorkspaceDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconKey, setIconKey] = useState<WorkspaceIconKey>(DEFAULT_WORKSPACE_ICON);
  const [saving, setSaving] = useState(false);

  const createAndActivate = useWorkspaceStore((s) => s.createAndActivate);
  const closeProject = useProjectStore((s) => s.closeProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const close = () => {
    setName('');
    setDescription('');
    setIconKey(DEFAULT_WORKSPACE_ICON);
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      closeProject();
      await createAndActivate({
        name: name.trim(),
        description: description.trim() || undefined,
        embeddingModel: 'text-embedding-3-small',
        iconKey,
      });
      await loadProjects();
      toast.success(t('workspace.created'));
      close();
    } catch (err: unknown) {
      toast.error(t('workspace.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      title={t('workspace.create')}
      closeLabel={t('common.cancel')}
      widthClassName="max-w-lg"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={close}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton onClick={() => void handleCreate()} disabled={!name.trim() || saving}>
            {saving ? t('workspace.saving') : t('common.save')}
          </DialogConfirmButton>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
            {t('workspace.nameLabel')}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder={t('workspace.namePlaceholder')}
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (crea nuovo workspace)
            autoFocus
          />
        </label>
        <WorkspaceIconPicker value={iconKey} onChange={setIconKey} />
        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
            {t('workspace.descriptionLabel')}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('workspace.descriptionPlaceholder')}
            className="min-h-16 w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </label>
      </div>
    </Dialog>
  );
}
