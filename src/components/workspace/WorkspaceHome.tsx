import { useEffect, useState } from 'react';
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

  const btnBase =
    'rounded-full border border-editorial-border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-colors hover:bg-editorial-ink hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent';
  const btnPrimary =
    'rounded-full bg-editorial-ink px-5 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35';
  const inputClass =
    'w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-2.5 text-sm text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent';

  return (
    <div className="flex h-full flex-col items-center justify-start overflow-y-auto px-6 py-12">
      <div className="w-full max-w-lg">

        {/* Workspace header */}
        <div className="mb-10 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-editorial-muted">
            Workspace attivo
          </p>
          <h1 className="text-2xl font-semibold text-editorial-ink">
            {activeWorkspace?.name ?? '—'}
          </h1>
        </div>

        {/* Project list */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-editorial-muted">
            Progetti
          </h2>

          {projects.length === 0 ? (
            <p className="rounded-[18px] border border-editorial-border px-4 py-6 text-center text-sm text-editorial-muted">
              Nessun progetto. Crea il primo progetto per iniziare.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[18px] border border-editorial-border px-4 py-3 text-left transition-colors hover:border-editorial-accent hover:bg-editorial-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    onClick={() => void openProject(project.id)}
                  >
                    <span className="text-sm font-medium text-editorial-ink">{project.name}</span>
                    <span className="text-xs text-editorial-muted">
                      {project.source_language} → {project.target_language}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Create project */}
        <section className="mb-10">
          {showCreateInput ? (
            <div className="flex flex-col gap-3">
              <input
                className={inputClass}
                placeholder="Nome progetto"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateProject();
                  if (e.key === 'Escape') setShowCreateInput(false);
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => void handleCreateProject()}
                  disabled={!newProjectName.trim() || creating}
                >
                  {creating ? 'Creazione...' : 'Crea progetto'}
                </button>
                <button
                  type="button"
                  className={btnBase}
                  onClick={() => setShowCreateInput(false)}
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setShowCreateInput(true)}
            >
              + Nuovo progetto
            </button>
          )}
        </section>

        {/* Backup actions */}
        <section className="flex flex-wrap gap-2 border-t border-editorial-border pt-6">
          <button
            type="button"
            className={btnBase}
            onClick={() => void exportWorkspace()}
          >
            Esporta backup
          </button>
          <button
            type="button"
            className={btnBase}
            onClick={() => void importWorkspace(t).then((ok) => ok && void loadProjects())}
          >
            Importa backup
          </button>
        </section>
      </div>
    </div>
  );
}
