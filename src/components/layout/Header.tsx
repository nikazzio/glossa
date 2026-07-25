import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChunksStore } from '../../stores/chunksStore';
import { EASE_EDITORIAL } from './motion';
import { ShellNavFooter } from './ShellNav';
import { Tooltip } from '../ui';

const HelpGuide = lazy(() =>
  import('../help/HelpGuide').then((m) => ({ default: m.HelpGuide })),
);

export function Header() {
  const { setShowHelp, showHelp, setActiveWorkspaceView } = useUiStore(
    useShallow((state) => ({
      setShowHelp: state.setShowHelp,
      showHelp: state.showHelp,
      setActiveWorkspaceView: state.setActiveWorkspaceView,
    })),
  );
  const { currentProjectId, currentProject, closeProject } = useProjectStore(
    useShallow((state) => ({
      currentProjectId: state.currentProjectId,
      currentProject: state.projects.find((p) => p.id === state.currentProjectId),
      closeProject: state.closeProject,
    })),
  );
  const { activeWorkspace, workspaces } = useWorkspaceStore(
    useShallow((state) => ({
      activeWorkspace: state.activeWorkspace,
      workspaces: state.workspaces,
    })),
  );
  const activeWorkspaceView = useUiStore((state) => state.activeWorkspaceView);
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const { t } = useTranslation();

  const helpLoaded = useRef(false);
  if (showHelp) helpLoaded.current = true;

  const currentProjectName = currentProject?.name ?? null;
  const projectWithoutWorkspace = currentProject?.workspace_id === null;
  const projectWorkspace = currentProject?.workspace_id
    ? workspaces.find((workspace) => workspace.id === currentProject.workspace_id)
    : activeWorkspace;
  const workspaceLabel = projectWorkspace?.name ?? activeWorkspace?.name ?? t('header.brandArea');
  const translationsLabel = t('workspace.areas.translations.title');
  const isTranslationsContext = activeWorkspaceView === 'translations' || projectWithoutWorkspace;
  const contextLabel = isTranslationsContext ? translationsLabel : workspaceLabel;
  const showContextBreadcrumb = Boolean(currentProjectId || activeWorkspaceView !== 'dashboard');
  const backToContextLabel = t(projectWithoutWorkspace ? 'sidebar.backToTranslations' : 'sidebar.backToWorkspace');

  const handleReturnToProjectContext = () => {
    closeProject();
    if (projectWithoutWorkspace) setActiveWorkspaceView('translations');
  };

  return (
    <header className="border-b border-editorial-border bg-[linear-gradient(180deg,var(--header-bg-from)_0%,var(--header-bg-to)_100%)] px-5 py-4 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="shrink-0 font-display text-4xl italic text-editorial-ink md:text-5xl">
                {t('app.brand')}
              </span>
              {showContextBreadcrumb && (
                <>
                  <span className="shrink-0 font-display text-lg italic text-editorial-muted md:text-xl">
                    //
                  </span>
                  {currentProjectId ? (
                    <Tooltip label={backToContextLabel}>
                      <button
                        type="button"
                        onClick={handleReturnToProjectContext}
                        disabled={isProcessing}
                        className="min-w-0 truncate font-display text-lg italic text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-55 md:text-xl"
                      >
                        {contextLabel}
                      </button>
                    </Tooltip>
                  ) : (
                    <span className="min-w-0 truncate font-display text-lg italic text-editorial-muted md:text-xl">
                      {contextLabel}
                    </span>
                  )}
                </>
              )}
              <AnimatePresence mode="popLayout">
                {currentProjectId && currentProjectName ? (
                  <motion.span
                    key="project-segment"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28, ease: EASE_EDITORIAL }}
                    className="flex min-w-0 items-baseline gap-2.5"
                  >
                    <span className="shrink-0 font-display text-lg italic text-editorial-muted md:text-xl">
                      //
                    </span>
                    <span className="min-w-0 truncate font-display text-lg italic text-editorial-muted md:text-xl">
                      {currentProjectName}
                    </span>
                  </motion.span>
                ) : null}
              </AnimatePresence>
          </div>
        </div>

        {activeWorkspace ? <ShellNavFooter variant="header" /> : null}
      </div>

      {helpLoaded.current && (
        <Suspense fallback={null}>
          <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
        </Suspense>
      )}
    </header>
  );
}
