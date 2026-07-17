import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function WorkspaceWizard() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const createAndActivate = useWorkspaceStore((s) => s.createAndActivate);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createAndActivate({
        name: name.trim(),
        description: description.trim() || undefined,
        embeddingModel: 'text-embedding-3-small',
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent';

  return (
    <div className="flex min-h-dvh min-h-[var(--app-min-height)] min-w-[var(--app-min-width)] flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold text-editorial-ink">
          {t('workspace.wizardTitle')}
        </h1>
        <p className="max-w-md text-center text-sm text-editorial-muted">
          {t('workspace.wizardBody')}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <input
          className={inputClass}
          placeholder={t('workspace.namePlaceholder')}
          aria-label={t('workspace.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- procedura guidata aperta da un click esplicito
          autoFocus
        />
        <input
          className={inputClass}
          placeholder={t('workspace.descriptionPlaceholder')}
          aria-label={t('workspace.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          type="button"
          className="rounded-full bg-editorial-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
          onClick={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? t('workspace.saving') : t('workspace.createFirst')}
        </button>
      </div>
    </div>
  );
}
