import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  FolderInput,
  LibraryBig,
  Link2,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { IconButton, SectionLabel, Select } from '../ui';
import { CreateProjectDialog } from '../projects/CreateProjectDialog';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';
import { WorkspaceDisposalDialog } from './WorkspaceDisposalDialog';
import { WorkspaceIcon } from './WorkspaceIdentity';
import {
  archiveWorkspace,
  moveDocumentToWorkspace,
  type WorkspaceDisposal,
} from '../../services/workspaceService';
import {
  linkedGlossaries,
  linkedSources,
  unlinkItem,
  type LinkedItem,
} from '../../services/workspaceItemsService';

/**
 * Pagina del workspace attivo: identità, azioni e contenuto (oggi i progetti
 * di traduzione; con la 2.0 anche testi e trascrizioni). Raggiunta cliccando
 * il workspace nel rail o nella Dashboard.
 */
export function WorkspaceOverview() {
  const { t, i18n } = useTranslation();
  const { activeWorkspace, workspaces, removeWorkspace, loadWorkspaces } = useWorkspaceStore();
  const { projects, loadProjects, openProject } = useProjectStore();
  const setShowLibraryPanel = useLibraryStore((s) => s.setShowLibraryPanel);

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showDisposal, setShowDisposal] = useState(false);
  /** Il progetto per cui si sta scegliendo il workspace di destinazione. */
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);

  /** Quello che è **collegato** qui: sta anche altrove, e si toglie da qui. */
  const [books, setBooks] = useState<LinkedItem[]>([]);
  const [dictionaries, setDictionaries] = useState<LinkedItem[]>([]);

  const loadLinked = useCallback(async () => {
    if (!activeWorkspace) {
      setBooks([]);
      setDictionaries([]);
      return;
    }
    const [sources, glossaries] = await Promise.all([
      linkedSources(activeWorkspace.id),
      linkedGlossaries(activeWorkspace.id),
    ]);
    setBooks(sources);
    setDictionaries(glossaries);
  }, [activeWorkspace]);

  useEffect(() => {
    void loadLinked();
  }, [loadLinked]);

  const unlink = async (type: 'source' | 'glossary', id: string) => {
    if (!activeWorkspace) return;
    try {
      await unlinkItem(activeWorkspace.id, type, id);
      await loadLinked();
    } catch (err: unknown) {
      toast.error(t('workspace.linked.unlinkFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const otherWorkspaces = useMemo(
    () => workspaces.filter((candidate) => candidate.id !== activeWorkspace?.id),
    [workspaces, activeWorkspace?.id],
  );

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

  /**
   * Eliminare un workspace non si rifiuta più: si dice cosa c'è dentro e si
   * lascia scegliere una volta sola — sposta tutto altrove, oppure elimina
   * tutto (#213).
   */
  const handleDisposal = async (disposal: WorkspaceDisposal) => {
    if (!activeWorkspace) return;
    try {
      await removeWorkspace(activeWorkspace.id, disposal);
      setShowDisposal(false);
      toast.success(
        disposal.kind === 'moveTo'
          ? t('workspace.disposal.moved')
          : t('workspace.disposal.deleted'),
      );
    } catch (err: unknown) {
      toast.error(t('workspace.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /**
   * Spostare una traduzione in un altro workspace: da adesso vede le risorse di
   * quello, e il lavoro già svolto resta contato dove è stato svolto (#213).
   */
  /** Mette da parte il workspace: niente si perde, sparisce dall'elenco. */
  const handleArchive = async () => {
    if (!activeWorkspace) return;
    try {
      await archiveWorkspace(activeWorkspace.id, true);
      setShowDisposal(false);
      toast.success(t('workspace.disposal.archived'));
      await loadWorkspaces();
    } catch (err: unknown) {
      toast.error(t('workspace.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleMoveProject = async (projectId: string, targetWorkspaceId: string) => {
    try {
      await moveDocumentToWorkspace('project', projectId, targetWorkspaceId);
      await loadProjects();
      toast.success(t('workspace.moveDocument.done'));
    } catch (err: unknown) {
      toast.error(t('workspace.moveDocument.failed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMovingProjectId(null);
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
                onClick={() => setShowDisposal(true)}
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
                // Una riga, due azioni: aprire il progetto e spostarlo. Il
                // contenitore non è un pulsante — un comando dentro un altro
                // comando non è una cosa che si può cliccare in modo prevedibile.
                <div
                  key={project.id}
                  className="flex w-full items-center justify-between gap-4 rounded-[16px] border border-editorial-border bg-editorial-bg/40 px-4 py-3 transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenProject(project.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <WorkspaceIcon iconKey={activeWorkspace?.iconKey} size={17} className="shrink-0 text-editorial-muted" />
                    <span className="truncate font-display text-base italic text-editorial-ink">
                      {project.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
                      {t('workspace.pipelineBadge', { count: project.pipeline_count })}
                    </span>
                  </button>

                  {movingProjectId === project.id ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <Select
                        value=""
                        onChange={(workspaceId) => {
                          if (workspaceId) void handleMoveProject(project.id, workspaceId);
                        }}
                        className="min-w-40"
                        ariaLabel={t('workspace.moveDocument.command')}
                        options={[
                          { value: '', label: t('workspace.moveDocument.pick') },
                          ...otherWorkspaces.map((candidate) => ({
                            value: candidate.id,
                            label: candidate.name,
                          })),
                        ]}
                      />
                      <IconButton
                        size="sm"
                        tone="muted"
                        onClick={() => setMovingProjectId(null)}
                        title={t('common.cancel')}
                      >
                        <X size={12} />
                      </IconButton>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-editorial-muted">
                        {formatSavedAt(project.updated_at)}
                      </span>
                      {otherWorkspaces.length > 0 && (
                        <IconButton
                          size="sm"
                          tone="muted"
                          onClick={() => setMovingProjectId(project.id)}
                          title={t('workspace.moveDocument.command')}
                        >
                          <FolderInput size={12} />
                        </IconButton>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-1 text-sm text-editorial-muted">{t('dashboard.resumeEmpty')}</p>
          )}
        </section>

        {/* Quello che è collegato qui: sta anche altrove, e da qui si toglie
            soltanto il collegamento (#213). */}
        {[
          { type: 'source' as const, icon: LibraryBig, items: books, label: t('areas.library.title') },
          { type: 'glossary' as const, icon: Link2, items: dictionaries, label: t('library.tabDictionaries') },
        ]
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <section className="mt-6" key={group.type}>
              <div className="mb-2 px-1">
                <SectionLabel icon={group.icon} label={group.label} />
              </div>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-[16px] border border-editorial-border bg-editorial-bg/40 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm text-editorial-ink">{item.label}</span>
                    <IconButton
                      size="sm"
                      tone="muted"
                      onClick={() => void unlink(group.type, item.id)}
                      title={t('workspace.linked.unlink')}
                    >
                      <X size={12} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      {activeWorkspace && (
        <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} workspaceId={activeWorkspace.id} />
      )}
      <WorkspaceSettingsModal open={showWorkspaceSettings} onClose={() => setShowWorkspaceSettings(false)} />
      {activeWorkspace && (
        <WorkspaceDisposalDialog
          open={showDisposal}
          workspace={activeWorkspace}
          others={otherWorkspaces}
          onClose={() => setShowDisposal(false)}
          onConfirm={handleDisposal}
          onArchive={handleArchive}
        />
      )}
    </main>
  );
}
