import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { confirm } from '../../stores/confirmStore';
import { relativeDateUnit } from '../../utils';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton, SectionLabel } from '../ui';

export function ProjectPanel() {
  const { t } = useTranslation();
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const {
    projects,
    currentProjectId,
    showProjectPanel,
    setShowProjectPanel,
    loadProjects,
    createAndOpen,
    openProject,
    removeProject,
    saveCurrentProject,
  } = useProjectStore();

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const closePanel = () => {
    setShowProjectPanel(false);
    setCreating(false);
    setNewName('');
    setOpeningProjectId(null);
  };
  const trapRef = useFocusTrap(showProjectPanel, closePanel);

  useEffect(() => {
    if (showProjectPanel) loadProjects();
  }, [showProjectPanel, loadProjects]);

  useEffect(() => {
    if (showProjectPanel) {
      setOpeningProjectId(null);
    }
  }, [showProjectPanel]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createAndOpen(newName.trim());
      closePanel();
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSave = async () => {
    try {
      await saveCurrentProject();
      toast.success(t('projects.saved'));
    } catch (err: any) {
      toast.error(t('projects.saveFailed'), { description: err?.message });
    }
  };

  const handleDelete = async (project: { id: string; name: string }) => {
    const ok = await confirm({
      title: t('projects.confirmDeleteTitle'),
      message: t('projects.confirmDeleteMessage', { name: project.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeProject(project.id);
      toast.success(t('projects.deleted'));
    } catch (err: any) {
      toast.error(t('projects.deleteFailed'), { description: err?.message });
    }
  };

  const handleOpenProject = async (projectId: string) => {
    setOpeningProjectId(projectId);
    try {
      await openProject(projectId);
      setShowProjectPanel(false);
    } catch (err: unknown) {
      setOpeningProjectId(null);
      toast.error(t('projects.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const formatRelative = (updatedAt: string) => {
    const unit = relativeDateUnit(updatedAt);
    if (unit.key === 'justNow') return t('projects.updatedJustNow');
    return t(`projects.updated${unit.key.charAt(0).toUpperCase()}${unit.key.slice(1)}`, {
      count: unit.count,
    });
  };
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const modalTitle = currentProject
    ? `${t('projects.title')} // ${currentProject.name}`
    : t('projects.title');

  return (
    <AnimatePresence>
      {showProjectPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 bg-editorial-ink/45 backdrop-blur-sm"
            onClick={closePanel}
          />
          <motion.div
            initial={{ y: 14, scale: 0.985, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.99, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-3xl"
          >
            <EditorialModalShell
              titleId="project-title"
              title={modalTitle}
              closeLabel={t('common.close')}
              onClose={closePanel}
              icon={<FolderOpen size={22} />}
              widthClassName="max-w-3xl"
              bodyClassName="px-5 py-5 md:px-6"
              headerActions={
                currentProjectId ? (
                  <IconButton
                    size="md"
                    onClick={handleSave}
                    title={t('projects.save')}
                    disabled={isProcessing}
                  >
                    <Save size={14} />
                  </IconButton>
                ) : null
              }
              footer={
                <div className="flex justify-end gap-2">
                  <PillButton onClick={closePanel}>
                    {t('common.close')}
                  </PillButton>
                </div>
              }
            >
              <div className="space-y-5">
                <section className="rounded-[24px] border border-editorial-border bg-editorial-paper/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <SectionLabel icon={FolderOpen} label={t('projects.title')} />
                    <IconButton
                      size="md"
                      tone={creating ? 'accent' : 'default'}
                      onClick={() => setCreating(true)}
                      disabled={creating}
                      title={t('projects.new')}
                    >
                      <Plus size={14} />
                    </IconButton>
                  </div>

                  <AnimatePresence initial={false}>
                    {creating ? (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="mt-4 space-y-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/25 px-4 py-4"
                      >
                        <label className="block space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted">
                            {t('projects.create')}
                          </span>
                          <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleCreate();
                              if (e.key === 'Escape') {
                                setCreating(false);
                                setNewName('');
                              }
                            }}
                            placeholder={t('projects.namePlaceholder')}
                            className="w-full rounded-[18px] border border-editorial-border bg-editorial-bg/80 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                            autoFocus
                          />
                        </label>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <PillButton
                            onClick={() => {
                              setCreating(false);
                              setNewName('');
                            }}
                          >
                            {t('common.cancel')}
                          </PillButton>
                          <PillButton
                            variant="accent"
                            onClick={() => void handleCreate()}
                            disabled={!newName.trim()}
                          >
                            {t('projects.create')}
                          </PillButton>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </section>

                <section className="space-y-3">
                  {projects.length === 0 && !creating ? (
                    <p className="rounded-[22px] border border-dashed border-editorial-border bg-editorial-paper/45 px-4 py-8 text-center font-display text-xl italic text-editorial-muted">
                      {t('projects.empty')}
                    </p>
                  ) : null}
                  {projects.map((project) => {
                    const absoluteDate = new Date(project.updated_at).toLocaleString();
                    const relativeLabel = formatRelative(project.updated_at);
                    const isOpening = openingProjectId === project.id;
                    const isDimmed = openingProjectId !== null && !isOpening;
                    return (
                      <motion.article
                        key={project.id}
                        initial={false}
                        animate={{
                          opacity: isDimmed ? 0.42 : 1,
                          scale: isOpening ? 0.99 : 1,
                          y: isOpening ? -1 : 0,
                        }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className={`group flex items-center gap-3 rounded-[22px] border bg-editorial-paper/65 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-colors ${
                          isOpening || project.id === currentProjectId
                            ? 'border-editorial-accent/60 bg-editorial-accent/8'
                            : 'border-editorial-border hover:border-editorial-accent/40 hover:bg-editorial-paper'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleOpenProject(project.id)}
                          disabled={openingProjectId !== null}
                          aria-busy={isOpening}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-wait"
                        >
                          <span
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-editorial-bg/80 transition-colors ${
                              isOpening || project.id === currentProjectId
                                ? 'border-editorial-accent/45 text-editorial-accent'
                                : 'border-editorial-border text-editorial-muted group-hover:border-editorial-accent/45 group-hover:text-editorial-accent'
                            }`}
                          >
                            <FolderOpen size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-lg italic text-editorial-ink">
                              {project.name}
                            </span>
                            <span
                              className="mt-1 block truncate font-mono text-xs text-editorial-muted"
                              title={absoluteDate}
                            >
                              {project.source_language} → {project.target_language} · {relativeLabel}
                            </span>
                          </span>
                        </button>
                        <IconButton
                          size="sm"
                          tone="muted"
                          onClick={() => {
                            void handleDelete(project);
                          }}
                          title={`${t('projects.delete')} ${project.name}`}
                          disabled={openingProjectId !== null}
                          ariaLabel={`${t('projects.delete')} ${project.name}`}
                          className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </motion.article>
                    );
                  })}
                </section>
              </div>
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
