import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChunksStore } from '../../stores/chunksStore';
import { translationsLocation } from '../../navigation/appLocation';
import { EASE_EDITORIAL } from './motion';
import { ShellNavFooter } from './ShellNav';
import { Tooltip } from '../ui';
import { WorkspaceIcon } from '../workspace/WorkspaceIdentity';

const HelpGuide = lazy(() =>
  import('../help/HelpGuide').then((m) => ({ default: m.HelpGuide })),
);

export function Header() {
  const { setShowHelp, showHelp, navigate } = useUiStore(
    useShallow((state) => ({
      setShowHelp: state.setShowHelp,
      showHelp: state.showHelp,
      navigate: state.navigate,
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
  const location = useUiStore((state) => state.location);
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
  const translationsLabel = t('areas.translations.title');
  const isTranslationsContext = location.area === 'translations' || projectWithoutWorkspace;
  const contextLabel = isTranslationsContext ? translationsLabel : workspaceLabel;
  const showContextBreadcrumb = Boolean(currentProjectId || location.area !== 'dashboard');
  const backToContextLabel = t(projectWithoutWorkspace ? 'sidebar.backToTranslations' : 'sidebar.backToWorkspace');

  const handleReturnToProjectContext = () => {
    closeProject();
    if (projectWithoutWorkspace) navigate(translationsLocation());
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
                    <span className="flex min-w-0 items-center gap-2 truncate font-display text-lg italic text-editorial-muted md:text-xl">
                      {!isTranslationsContext && projectWorkspace && <WorkspaceIcon iconKey={projectWorkspace.iconKey} size={16} className="shrink-0 text-editorial-accent" />}
                      <span className="truncate">{contextLabel}</span>
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
