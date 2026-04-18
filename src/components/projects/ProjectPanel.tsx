import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, Save, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function ProjectPanel() {
  const { t } = useTranslation();
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
            className="relative bg-editorial-bg w-full max-w-lg max-h-[80vh] overflow-y-auto p-10 custom-scrollbar shadow-2xl border border-editorial-border"
          >
            <button
              onClick={() => setShowProjectPanel(false)}
              className="absolute top-6 right-6 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('settings.saveClose')}
            >
              <X size={20} />
            </button>

            <h2 id="project-title" className="font-display text-2xl italic tracking-tight mb-8 flex items-center gap-3">
              <FolderOpen size={24} className="text-editorial-accent" />
              {t('projects.title')}
            </h2>

            {/* Current project indicator */}
            {currentProjectId && (
              <div className="mb-6 flex items-center justify-between bg-editorial-textbox/30 border border-editorial-border p-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('projects.current')}: {projects.find((p) => p.id === currentProjectId)?.name}
                </span>
                <button
                  onClick={saveCurrentProject}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-editorial-ink hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('projects.save')}
                >
                  <Save size={12} /> {t('projects.save')}
                </button>
              </div>
            )}

            {/* New project */}
            {creating ? (
              <div className="mb-6 flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder={t('projects.namePlaceholder')}
                  className="flex-1 bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none"
                  autoFocus
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="px-3 py-2 bg-editorial-ink text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-30"
                >
                  {t('projects.create')}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(''); }}
                  className="px-2 text-editorial-muted hover:text-editorial-ink"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="mb-6 w-full border border-dashed border-editorial-border py-3 text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink hover:border-editorial-ink transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={14} /> {t('projects.new')}
              </button>
            )}

            {/* Project list */}
            <div className="space-y-2">
              {projects.length === 0 && !creating && (
                <p className="text-center text-xs text-editorial-muted py-8 italic">
                  {t('projects.empty')}
                </p>
              )}
              {projects.map((project) => (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  className={`flex items-center gap-3 p-3 border transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    project.id === currentProjectId
                      ? 'border-editorial-ink bg-editorial-bg'
                      : 'border-editorial-border hover:bg-editorial-textbox/50'
                  }`}
                  onClick={() => { openProject(project.id); setShowProjectPanel(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(project.id); setShowProjectPanel(false); } }}
                >
                  <FolderOpen
                    size={16}
                    className={project.id === currentProjectId ? 'text-editorial-accent' : 'text-editorial-muted'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-display truncate">{project.name}</div>
                    <div className="text-[9px] text-editorial-muted font-mono">
                      {project.source_language} → {project.target_language}
                      {' · '}
                      {new Date(project.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(project.id);
                    }}
                    className="p-1 text-editorial-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-editorial-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    aria-label={`${t('projects.delete')} ${project.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
