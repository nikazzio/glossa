import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Select } from '../ui';

export function ResourceWorkspaceFilter({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  return <Select value={value} onChange={onChange} disabled={disabled} ariaLabel={t('library.workspaceFilter')} className="max-w-56"
    options={[{ value: 'all', label: t('library.allWorkspaces') }, { value: 'none', label: t('memory.provenance.noWorkspace') },
      ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))]} />;
}
