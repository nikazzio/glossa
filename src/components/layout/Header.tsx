import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChunksStore } from '../../stores/chunksStore';
import { EASE_EDITORIAL } from './motion';

const HelpGuide = lazy(() =>
  import('../help/HelpGuide').then((m) => ({ default: m.HelpGuide })),
);

export function Header() {
  const { setShowHelp, showHelp } = useUiStore(
    useShallow((state) => ({
      setShowHelp: state.setShowHelp,
      showHelp: state.showHelp,
    })),
  );
  const { currentProjectId, currentProjectName, closeProject } = useProjectStore(
    useShallow((state) => ({
      currentProjectId: state.currentProjectId,
      currentProjectName: state.projects.find((p) => p.id === state.currentProjectId)?.name ?? null,
      closeProject: state.closeProject,
    })),
  );
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const { t } = useTranslation();

  const helpLoaded = useRef(false);
  if (showHelp) helpLoaded.current = true;

  const workspaceLabel = activeWorkspace?.name ?? t('header.brandArea');

  return (
    <header className="border-b border-editorial-border bg-[linear-gradient(180deg,var(--header-bg-from)_0%,var(--header-bg-to)_100%)] px-5 py-4 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="shrink-0 font-display text-4xl italic text-editorial-ink md:text-5xl">
              {t('app.brand')}
            </span>
            <span className="shrink-0 font-display text-lg italic text-editorial-muted md:text-xl">
              //
            </span>
            {currentProjectId ? (
              <button
                type="button"
                onClick={closeProject}
                disabled={isProcessing}
                className="min-w-0 truncate font-display text-lg italic text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-55 md:text-xl"
                title={t('sidebar.backToWorkspace')}
              >
                {workspaceLabel}
              </button>
            ) : (
              <span className="min-w-0 truncate font-display text-lg italic text-editorial-muted md:text-xl">
                {workspaceLabel}
              </span>
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

      </div>

      {helpLoaded.current && (
        <Suspense fallback={null}>
          <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
        </Suspense>
      )}
    </header>
  );
}
