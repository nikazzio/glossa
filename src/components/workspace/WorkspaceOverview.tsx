import { useEffect, useMemo, useState } from 'react';
import { BookOpenText, LibraryBig, Plus, Settings2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { confirm } from '../../stores/confirmStore';
import { IconButton, SectionLabel } from '../ui';
import { CreateProjectDialog } from '../projects/CreateProjectDialog';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';
import { WorkspaceIcon } from './WorkspaceIdentity';

/**
 * Pagina del workspace attivo: identità, azioni e contenuto (oggi i progetti
 * di traduzione; con la 2.0 anche testi e trascrizioni). Raggiunta cliccando
 * il workspace nel rail o nella Dashboard.
 */
export function WorkspaceOverview() {
  const { t, i18n } = useTranslation();
  const { activeWorkspace, removeWorkspace } = useWorkspaceStore();
  const { projects, loadProjects, openProject } = useProjectStore();
  const setShowLibraryPanel = useLibraryStore((s) => s.setShowLibraryPanel);

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

  useEffect(() => { void loadProjects(); }, [activeWorkspace?.id, loadProjects]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [projects],
  );

  const formatSavedAt = (updatedAt: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(updatedAt));

  const handleOpenProject = (projectId: string) => {
    openProject(projectId).catch((err: unknown) => {
      toast.error(t('projects.openFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace) return;
    if (projects.length > 0) {
      toast.error(t('workspace.deleteBlockedTitle'), {
        description: t('workspace.deleteBlockedMessage', { count: projects.length }),
      });
      return;
    }
    const ok = await confirm({
      title: t('workspace.deleteTitle'),
      message: t('workspace.deleteMessage', { name: activeWorkspace.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeWorkspace(activeWorkspace.id);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : String(err);
      toast.error(t('workspace.deleteBlockedTitle'), {
        description: code === 'workspace_has_glossaries'
          ? t('workspace.deleteBlockedGlossariesMessage')
          : t('workspace.deleteFailed'),
      });
    }
  };

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="min-w-0 max-w-5xl px-5 py-5 md:px-6">
        {/* Identità e azioni del workspace */}
        <section>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                {activeWorkspace && <WorkspaceIcon iconKey={activeWorkspace.iconKey} size={32} className="shrink-0 text-editorial-accent" />}
                <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
                  {activeWorkspace?.name ?? t('workspace.noActive')}
                </h1>
              </div>
              {activeWorkspace?.description ? (
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                  {activeWorkspace.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-1">
              <IconButton
                size="md"
                tone="muted"
                onClick={() => setShowLibraryPanel(true)}
                title={t('library.openLibrary')}
                tooltipSide="bottom"
                disabled={!activeWorkspace}
              >
                <LibraryBig size={15} />
              </IconButton>
              <IconButton
                size="md"
                tone="muted"
                onClick={() => setShowWorkspaceSettings(true)}
                title={t('workspace.configure')}
                tooltipSide="bottom"
                disabled={!activeWorkspace}
              >
                <Settings2 size={15} />
              </IconButton>
              <IconButton
                size="md"
                tone="muted"
                onClick={() => void handleDeleteWorkspace()}
                title={t('workspace.delete')}
                tooltipSide="bottom"
                disabled={!activeWorkspace}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          </div>
        </section>

        {/* Progetti di traduzione del workspace */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <SectionLabel icon={BookOpenText} label={t('areas.translations.title')} />
            <IconButton
              size="sm"
              tone="muted"
              onClick={() => setShowCreateProject(true)}
              title={t('workspace.newBookCard')}
              disabled={!activeWorkspace}
            >
              <Plus size={12} />
            </IconButton>
          </div>
          {sortedProjects.length > 0 ? (
            <div className="space-y-1.5">
              {sortedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleOpenProject(project.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[16px] border border-editorial-border bg-editorial-bg/40 px-4 py-3 text-left transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <BookOpenText size={14} className="shrink-0 text-editorial-muted" />
                    <span className="truncate font-display text-base italic text-editorial-ink">
                      {project.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
                      {t('workspace.pipelineBadge', { count: project.pipeline_count })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-editorial-muted">
                    {formatSavedAt(project.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 text-sm text-editorial-muted">{t('dashboard.resumeEmpty')}</p>
          )}
        </section>
      </div>

      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} />
      <WorkspaceSettingsModal open={showWorkspaceSettings} onClose={() => setShowWorkspaceSettings(false)} />
    </main>
  );
}
