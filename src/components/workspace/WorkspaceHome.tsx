import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  Database,
  FilePen,
  KeyRound,
  LibraryBig,
  Lock,
  Plus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton, SectionLabel } from '../ui';
import type { WorkspaceArea } from '../../stores/uiStore';

const AREA_ICONS: Record<WorkspaceArea, React.ComponentType<{ size?: number }>> = {
  translations: BookOpenText,
  library: LibraryBig,
  transcriptions: FilePen,
};

export function WorkspaceHome() {
  const { t, i18n } = useTranslation();
  const { activeWorkspace } = useWorkspaceStore();
  const setActiveWorkspaceArea = useUiStore((s) => s.setActiveWorkspaceArea);
  const setShowSettings = useUiStore((state) => state.setShowSettings);
  const { statuses: keyStatuses, isLoading: keyStatusLoading } = useProviderKeyStatus();
  const { projects, loadProjects, createAndOpen } = useProjectStore();

  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const createProjectDialogRef = useFocusTrap(showNewProjectForm, () => {
    setShowNewProjectForm(false);
    setNewProjectName('');
  });

  useEffect(() => { void loadProjects(); }, [activeWorkspace?.id, loadProjects]);

  const createdLabel = useMemo(() => {
    if (!activeWorkspace?.createdAt) return '—';
    return new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(activeWorkspace.createdAt));
  }, [activeWorkspace?.createdAt, i18n.language]);

  const recentProjects = useMemo(
    () => [...projects]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 3),
    [projects],
  );

  const hasRemoteProvider = Object.values(keyStatuses).some(Boolean);
  const shouldShowProviderBanner = !keyStatusLoading && !hasRemoteProvider;

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await createAndOpen(newProjectName.trim());
      setShowNewProjectForm(false);
      setNewProjectName('');
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const formatSavedAt = (updatedAt: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(updatedAt));

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="min-w-0 px-5 py-5 md:px-6 max-w-5xl">

        {/* Header */}
        <section>
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
            {activeWorkspace?.name ?? t('workspace.noActive')}
          </h1>
          {activeWorkspace?.description ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
              {activeWorkspace.description}
            </p>
          ) : null}
        </section>

        {/* Provider banner */}
        {shouldShowProviderBanner ? (
          <section className="mt-5 rounded-[20px] border border-editorial-accent/35 bg-editorial-accent/8 px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-editorial-accent/35 bg-editorial-paper text-editorial-accent">
                  <KeyRound size={15} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-xl italic text-editorial-ink">
                    {t('workspace.providerBannerTitle')}
                  </p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                    {t('workspace.providerBannerBody')}
                  </p>
                </div>
              </div>
              <PillButton variant="accent" onClick={() => setShowSettings(true, 'provider')} className="shrink-0">
                {t('workspace.providerBannerCta')}
              </PillButton>
            </div>
          </section>
        ) : null}

        {/* Area cards */}
        <section className="mt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Translations — active */}
            <button
              type="button"
              onClick={() => setActiveWorkspaceArea('translations')}
              className="group rounded-[24px] border border-editorial-border bg-editorial-paper/75 px-5 py-4 text-left shadow-[var(--inset-highlight)] transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <span className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg/85 text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
                  <BookOpenText size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg italic text-editorial-ink">
                    {t('workspace.areas.translations.title')}
                  </span>
                  <span className="mt-1 block text-xs text-editorial-muted [text-wrap:pretty]">
                    {t('workspace.areas.translations.body')}
                  </span>
                  <span className="mt-2 block text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
                    {t('workspace.projectsMetric', { count: projects.length })}
                  </span>
                </span>
              </span>
            </button>

            {/* Library — locked */}
            <LockedAreaCard area="library" />

            {/* Transcriptions — locked */}
            <LockedAreaCard area="transcriptions" />
          </div>
        </section>

        {/* Recent projects */}
        {recentProjects.length > 0 ? (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel icon={Database} label={t('workspace.hub.recentProjects')} />
              <button
                type="button"
                onClick={() => setActiveWorkspaceArea('translations')}
                className="text-xs text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded-md"
              >
                {t('workspace.hub.allProjects')} →
              </button>
            </div>
            <div className="space-y-2">
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-editorial-border bg-editorial-bg/40 px-4 py-2.5"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <BookOpenText size={13} className="shrink-0 text-editorial-muted" />
                    <span className="truncate font-display text-base italic text-editorial-ink">
                      {project.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-editorial-muted">
                    {formatSavedAt(project.updated_at)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Quick action */}
        <section className="mt-5">
          <IconButton
            size="md"
            onClick={() => setShowNewProjectForm(true)}
            title={t('workspace.newBookCard')}
            disabled={!activeWorkspace || showNewProjectForm}
            className="bg-editorial-textbox/25 hover:bg-editorial-textbox/45"
          >
            <Plus size={14} />
          </IconButton>
        </section>
      </div>

      {/* New project dialog */}
      <AnimatePresence>
        {showNewProjectForm ? (
          <div
            ref={createProjectDialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog" aria-modal="true" aria-labelledby="create-project-title"
          >
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-editorial-ink/35 backdrop-blur-sm"
              onClick={() => { setShowNewProjectForm(false); setNewProjectName(''); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="relative w-full max-w-lg"
            >
              <EditorialModalShell
                titleId="create-project-title"
                title={t('projects.create')}
                eyebrow={activeWorkspace?.name ?? t('workspace.noActive')}
                closeLabel={t('common.cancel')}
                onClose={() => { setShowNewProjectForm(false); setNewProjectName(''); }}
                icon={<BookOpenText size={22} />}
                widthClassName="max-w-lg"
                bodyClassName="px-6 py-6 md:px-8"
                footer={
                  <div className="flex justify-end gap-2">
                    <PillButton onClick={() => { setShowNewProjectForm(false); setNewProjectName(''); }}>
                      {t('common.cancel')}
                    </PillButton>
                    <PillButton
                      variant="accent"
                      onClick={() => void handleCreateProject()}
                      disabled={!newProjectName.trim() || creatingProject}
                    >
                      {creatingProject ? t('workspace.saving') : t('projects.create')}
                    </PillButton>
                  </div>
                }
              >
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
                    {t('workspace.newBookCard')}
                  </span>
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreateProject();
                      if (e.key === 'Escape') { setShowNewProjectForm(false); setNewProjectName(''); }
                    }}
                    placeholder={t('projects.namePlaceholder')}
                    className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    autoFocus
                  />
                </label>
              </EditorialModalShell>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function LockedAreaCard({ area }: { area: 'library' | 'transcriptions' }) {
  const { t } = useTranslation();
  const Icon = AREA_ICONS[area];
  return (
    <div className="rounded-[24px] border border-editorial-border/60 bg-editorial-bg/30 px-5 py-4 opacity-60">
      <span className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg/85 text-editorial-muted">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-lg italic text-editorial-muted">
              {t(`workspace.areas.${area}.title`)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-editorial-border bg-editorial-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
              <Lock size={8} />
              2.0
            </span>
          </span>
          <span className="mt-1 block text-xs text-editorial-muted [text-wrap:pretty]">
            {t('workspace.hub.lockedArea')}
          </span>
        </span>
      </span>
    </div>
  );
}
