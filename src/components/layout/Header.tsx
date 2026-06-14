import { LibraryBig, Save } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { IconButton, Tooltip } from '../ui';

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
  const { currentProjectId, currentProjectName, saveCurrentProject, closeProject } = useProjectStore(
    useShallow((state) => ({
      currentProjectId: state.currentProjectId,
      currentProjectName: state.projects.find((project) => project.id === state.currentProjectId)?.name ?? null,
      saveCurrentProject: state.saveCurrentProject,
      closeProject: state.closeProject,
    })),
  );
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const { dirtyIdsLength, saveAllDirty, setShowLibraryPanel } = useLibraryStore(
    useShallow((state) => ({
      dirtyIdsLength: state.dirtyIds.length,
      saveAllDirty: state.saveAllDirty,
      setShowLibraryPanel: state.setShowLibraryPanel,
    })),
  );
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const { t, i18n } = useTranslation();
  const [savingAll, setSavingAll] = useState(false);

  const helpLoaded = useRef(false);
  if (showHelp) helpLoaded.current = true;

  const workspaceLabel = activeWorkspace?.name ?? t('header.brandArea');

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'it' : 'en');
  };

  const handleSave = async () => {
    if (savingAll) return;

    const shouldSaveProject = Boolean(currentProjectId) && !isProcessing;
    const shouldSaveLibrary = dirtyIdsLength > 0;
    const projectDeferred = Boolean(currentProjectId) && isProcessing;

    if (!shouldSaveProject && !shouldSaveLibrary) {
      toast[projectDeferred ? 'warning' : 'success'](
        t(projectDeferred ? 'header.projectSaveDeferred' : 'header.nothingToSave'),
      );
      return;
    }

    setSavingAll(true);
    const errors: unknown[] = [];
    try {
      if (shouldSaveProject) {
        try {
          await saveCurrentProject();
        } catch (err: unknown) {
          errors.push(err);
        }
      }
      if (shouldSaveLibrary) {
        try {
          await saveAllDirty();
        } catch (err: unknown) {
          errors.push(err);
        }
      }

      if (errors.length > 0) {
        throw errors[0];
      }

      toast[projectDeferred ? 'warning' : 'success'](
        t(projectDeferred ? 'header.savedLibraryProjectDeferred' : 'header.savedAll'),
      );
    } catch (err: unknown) {
      toast.error(t('header.globalSaveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <header className="border-b border-editorial-border bg-[linear-gradient(180deg,#fffdf8_0%,#f8f3ea_100%)] px-5 py-4 md:px-8">
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
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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

        {/* Right cluster — global actions only */}
        <div className="flex items-center gap-1 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1 shadow-sm">
          <IconButton
            onClick={() => void handleSave()}
            title={`${t('header.saveAll')} (Ctrl+S)`}
            ariaLabel={t('header.saveAll')}
            tooltipSide="bottom"
            tone={savingAll ? 'running' : 'default'}
            aria-busy={savingAll}
          >
            <Save size={16} />
          </IconButton>
          <IconButton
            onClick={() => setShowLibraryPanel(true)}
            title={t('library.openLibrary')}
            tooltipSide="bottom"
          >
            <LibraryBig size={16} />
          </IconButton>
          <Tooltip
            label={`${t('language.label')} (${i18n.language === 'it' ? 'IT -> EN' : 'EN -> IT'})`}
            side="bottom"
          >
            <button
              type="button"
              onClick={toggleLang}
              aria-label={t('language.label')}
              className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-editorial-border text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <span className="select-none font-mono text-[10px] font-bold leading-none">
                {i18n.language.toUpperCase()}
              </span>
            </button>
          </Tooltip>
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
