import { useEffect, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useProjectStore } from '../../stores/projectStore';
import { exportWorkspace, importWorkspace } from '../../services/backupService';
import { useTranslation } from 'react-i18next';

export function WorkspaceHome() {
  const { t } = useTranslation();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const { projects, loadProjects, createAndOpen, openProject } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      await createAndOpen(newProjectName.trim());
    } finally {
      setCreating(false);
      setNewProjectName('');
      setShowCreateInput(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-start overflow-y-auto px-6 py-12">
      <div className="w-full max-w-2xl space-y-6">

        {/* Workspace header */}
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
            Workspace attivo
          </p>
          <h1 className="text-2xl font-display italic text-editorial-ink">
            {activeWorkspace?.name ?? '—'}
          </h1>
        </div>

        {/* Project list section */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
            Progetti
          </p>

          {projects.length === 0 ? (
            <p className="rounded-[20px] border border-dashed border-editorial-border px-4 py-8 text-center text-sm italic text-editorial-muted">
              Nessun progetto. Crea il primo per iniziare.
            </p>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  className="group flex items-center gap-3 rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-4 transition-colors hover:border-editorial-accent/40 hover:bg-editorial-textbox/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  onClick={() => void openProject(project.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openProject(project.id); } }}
                >
                  <FolderOpen size={16} className="text-editorial-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-display italic text-editorial-ink">{project.name}</div>
                    <div className="mt-1 text-[10px] font-mono text-editorial-muted">
                      {project.source_language} → {project.target_language}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create project */}
        {showCreateInput ? (
          <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-4 py-4">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateProject();
                if (e.key === 'Escape') { setShowCreateInput(false); setNewProjectName(''); }
              }}
              placeholder="Nome progetto"
              className="w-full rounded-[16px] border border-editorial-border bg-editorial-bg/80 px-3 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              autoFocus
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setShowCreateInput(false); setNewProjectName(''); }}
                className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => void handleCreateProject()}
                disabled={!newProjectName.trim() || creating}
                className="rounded-full bg-editorial-ink px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {creating ? 'Creazione...' : 'Crea'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreateInput(true)}
            aria-label="Nuovo progetto"
            className="rounded-full border border-dashed border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Plus size={14} />
          </button>
        )}

        {/* Backup actions */}
        <div className="flex flex-wrap gap-2 border-t border-editorial-border pt-6">
          <button
            type="button"
            onClick={() => void exportWorkspace()}
            className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            Esporta backup
          </button>
          <button
            type="button"
            onClick={() => void importWorkspace(t).then((ok) => ok && void loadProjects())}
            className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            Importa backup
          </button>
        </div>
      </div>
    </div>
  );
}
