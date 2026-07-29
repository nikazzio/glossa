import { useEffect } from 'react';
import { BookOpenText, Link2, LibraryBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, IconButton, SectionLabel } from '../ui';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

interface LibraryCatalogAreaProps {
  itemId?: string;
}

/** Catalogo personale delle fonti: la ricerca vive nella Dashboard, qui solo consultazione e collegamento workspace. */
export function LibraryCatalogArea({ itemId }: LibraryCatalogAreaProps) {
  const { t } = useTranslation();
  const sources = useSourceLibraryStore((state) => state.sources);
  const detail = useSourceLibraryStore((state) => state.detail);
  const loadSources = useSourceLibraryStore((state) => state.loadSources);
  const loadDetail = useSourceLibraryStore((state) => state.loadDetail);
  const toggleWorkspaceLink = useSourceLibraryStore((state) => state.toggleWorkspaceLink);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (itemId) void loadDetail(itemId);
  }, [itemId, loadDetail]);

  if (itemId && detail) {
    return (
      <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
        <div className="px-5 py-5 md:px-6">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{detail.source.title}</h1>
          <dl className="mt-4 space-y-2 text-sm text-editorial-muted">
            <div><dt className="inline text-editorial-muted">{t('areas.library.kind')}</dt><dd className="inline pl-2 text-editorial-ink">{detail.source.kind}</dd></div>
            {detail.versions.map((version) => (
              <div key={version.id}><dt className="inline text-editorial-muted">{version.label}</dt><dd className="inline pl-2 text-editorial-ink">{version.sourceUrl}</dd></div>
            ))}
          </dl>
          {workspaces.length > 0 && (
            <div className="mt-6">
              <SectionLabel icon={Link2} label={t('areas.library.linkedWorkspaces')} />
              <ul className="mt-2 space-y-1">
                {workspaces.map((workspace) => {
                  const linked = detail.linkedWorkspaceIds.includes(workspace.id);
                  return (
                    <li key={workspace.id} className="flex items-center justify-between gap-3 rounded-md border border-editorial-border bg-surface-elevated px-3 py-2">
                      <span className="min-w-0 truncate text-sm text-editorial-ink">{workspace.name}</span>
                      <IconButton
                        title={linked ? t('areas.library.unlinkWorkspace', { name: workspace.name }) : t('areas.library.linkWorkspace', { name: workspace.name })}
                        onClick={() => void toggleWorkspaceLink(workspace.id, detail.source.id, !linked)}
                        tone={linked ? 'accent' : 'default'}
                        ariaPressed={linked}
                        size="sm"
                      >
                        <Link2 size={14} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('areas.library.title')}
        </h1>
        {sources.length === 0 ? (
          <EmptyState
            icon={<LibraryBig size={28} />}
            message={t('areas.library.emptyMessage')}
            hint={t('areas.library.emptyHint')}
            className="min-h-72"
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center gap-3 rounded-md border border-editorial-border bg-surface-elevated p-3">
                <BookOpenText size={18} className="shrink-0 text-editorial-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-display italic text-editorial-ink">{source.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
