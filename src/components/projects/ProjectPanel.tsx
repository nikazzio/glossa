import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { confirm } from '../../stores/confirmStore';
import { relativeDateUnit } from '../../utils';
import { EditorialModalShell } from '../common';

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
  const trapRef = useFocusTrap(showProjectPanel, () => setShowProjectPanel(false));

  useEffect(() => {
    if (showProjectPanel) loadProjects();
  }, [showProjectPanel, loadProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createAndOpen(newName.trim());
    setNewName('');
    setCreating(false);
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

  const formatRelative = (updatedAt: string) => {
    const unit = relativeDateUnit(updatedAt);
    if (unit.key === 'justNow') return t('projects.updatedJustNow');
    return t(`projects.updated${unit.key.charAt(0).toUpperCase()}${unit.key.slice(1)}`, {
      count: unit.count,
    });
  };

  return (
    <AnimatePresence>
      {showProjectPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
            onClick={() => setShowProjectPanel(false)}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-2xl"
          >
            <EditorialModalShell
              titleId="project-title"
              title={t('projects.title')}
              closeLabel={t('settings.close')}
              onClose={() => setShowProjectPanel(false)}
              icon={<FolderOpen size={22} />}
              widthClassName="max-w-2xl"
              bodyClassName="px-6 py-6 md:px-8"
              footer={
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowProjectPanel(false)}
                    className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {t('common.close')}
                  </button>
                </div>
              }
            >
              <div className="space-y-6">
                {currentProjectId && (
                  <div className="flex items-center justify-between rounded-[20px] border border-editorial-border bg-editorial-textbox/25 px-4 py-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                      {t('projects.current')}: {projects.find((p) => p.id === currentProjectId)?.name}
                    </span>
                    <button
                      onClick={handleSave}
                      title={t('projects.save')}
                      disabled={isProcessing}
                      className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={t('projects.save')}
                    >
                      <Save size={12} /> {t('projects.save')}
                    </button>
                  </div>
                )}

                {creating ? (
                  <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-4 py-4">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                        if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                      }}
                      placeholder={t('projects.namePlaceholder')}
                      className="w-full rounded-[16px] border border-editorial-border bg-editorial-bg/80 px-3 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      autoFocus
                    />
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => { setCreating(false); setNewName(''); }}
                        className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleCreate}
                        disabled={!newName.trim()}
                        className="rounded-full bg-editorial-ink px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 disabled:opacity-30"
                      >
                        {t('projects.create')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:border-editorial-accent hover:text-editorial-accent"
                  >
                    <Plus size={14} /> {t('projects.new')}
                  </button>
                )}

                <div className="space-y-3">
                  {projects.length === 0 && !creating ? (
                    <p className="rounded-[20px] border border-dashed border-editorial-border px-4 py-8 text-center text-sm italic text-editorial-muted">
                      {t('projects.empty')}
                    </p>
                  ) : null}
                  {projects.map((project) => {
                    const absoluteDate = new Date(project.updated_at).toLocaleString();
                    const relativeLabel = formatRelative(project.updated_at);
                    return (
                      <div
                        key={project.id}
                        role="button"
                        tabIndex={0}
                        className={`group flex items-center gap-3 rounded-[20px] border px-4 py-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                          project.id === currentProjectId
                            ? 'border-editorial-accent bg-editorial-accent/8'
                            : 'border-editorial-border bg-editorial-bg hover:border-editorial-accent/40 hover:bg-editorial-textbox/35'
                        }`}
                        onClick={() => { openProject(project.id).catch((err: unknown) => toast.error(t('projects.loadFailed'), { description: err instanceof Error ? err.message : String(err) })); setShowProjectPanel(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(project.id).catch((err: unknown) => toast.error(t('projects.loadFailed'), { description: err instanceof Error ? err.message : String(err) })); setShowProjectPanel(false); } }}
                      >
                        <FolderOpen
                          size={16}
                          className={project.id === currentProjectId ? 'text-editorial-accent' : 'text-editorial-muted'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-display italic text-editorial-ink truncate">{project.name}</div>
                          <div className="mt-1 text-[10px] font-mono text-editorial-muted" title={absoluteDate}>
                            {project.source_language} → {project.target_language} {' · '} {relativeLabel}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(project);
                          }}
                          title={`${t('projects.delete')} ${project.name}`}
                          className="rounded-full border border-transparent p-2 text-editorial-muted transition-colors hover:border-editorial-accent/20 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                          aria-label={`${t('projects.delete')} ${project.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
