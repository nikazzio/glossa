import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useTranscriptionStore } from '../../stores/transcriptionStore';
import {
  analysisLocation,
  dashboardLocation,
  isGlobalArea,
  libraryLocation,
  transcriptionsLocation,
  translationsLocation,
  workspaceLocation,
  type AppLocation,
  type GlobalArea,
} from '../../navigation/appLocation';
import { EASE_EDITORIAL } from './motion';
import { ShellNavFooter } from './ShellNav';
import { Tooltip } from '../ui';
import { WorkspaceIcon } from '../workspace/WorkspaceIdentity';

const HelpGuide = lazy(() =>
  import('../help/HelpGuide').then((m) => ({ default: m.HelpGuide })),
);

/**
 * Le aree globali (#210) non dipendono da un workspace attivo, solo da un
 * filtro opzionale: il titolo in alto deve dirlo, non cadere sul nome del
 * workspace come se ci si trovasse ancora dentro a uno.
 */
const GLOBAL_AREA_LABEL_KEYS: Record<GlobalArea, string> = {
  library: 'areas.library.title',
  transcriptions: 'areas.transcriptions.title',
  translations: 'areas.translations.title',
  analysis: 'areas.analysis.title',
};

const GLOBAL_AREA_LOCATIONS: Record<GlobalArea, () => AppLocation> = {
  library: () => libraryLocation(),
  transcriptions: () => transcriptionsLocation(),
  translations: () => translationsLocation(),
  analysis: () => analysisLocation(),
};

const GLOBAL_AREA_BACK_KEYS: Record<GlobalArea, string> = {
  library: 'sidebar.backToLibrary',
  transcriptions: 'sidebar.backToTranscriptions',
  translations: 'sidebar.backToTranslations',
  analysis: 'sidebar.backToAnalysis',
};

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
  const librarySourceDetail = useSourceLibraryStore((state) => state.detail);
  const transcriptionDetail = useTranscriptionStore((state) => state.detail);
  const { t } = useTranslation();

  const helpLoaded = useRef(false);
  if (showHelp) helpLoaded.current = true;

  const currentProjectName = currentProject?.name ?? null;
  const projectWithoutWorkspace = currentProject?.workspace_id === null;
  const projectWorkspace = currentProject?.workspace_id
    ? workspaces.find((workspace) => workspace.id === currentProject.workspace_id)
    : activeWorkspace;
  const workspaceLabel = projectWorkspace?.name ?? activeWorkspace?.name ?? t('header.brandArea');
  // Le aree globali (#210) non dipendono da un workspace attivo: cadere sul
  // suo nome mostrava, entrando in Biblioteca o Trascrizioni, il workspace da
  // cui si veniva invece del nome dell'area in cui si è davvero.
  const globalArea: GlobalArea | null = isGlobalArea(location)
    ? location.area
    : projectWithoutWorkspace
      ? 'translations'
      : null;
  const isGlobalAreaContext = globalArea !== null;
  // La Dashboard ha tre schede: dentro una scheda il nome dell'area torna
  // visibile e riporta alla panoramica, perché «Glossa // Ricerca federata»
  // salterebbe il passaggio che c'è davvero.
  const dashboardSection = location.area === 'dashboard' ? location.view : undefined;
  const contextLabel = globalArea
    ? t(GLOBAL_AREA_LABEL_KEYS[globalArea])
    : dashboardSection
      ? t('dashboard.title')
      : workspaceLabel;
  const showContextBreadcrumb = Boolean(
    currentProjectId || location.area !== 'dashboard' || dashboardSection,
  );
  // Aprendo un'opera della Biblioteca, il titolo resta in vista nel
  // breadcrumb: cambiando tab nella colonna informazioni non si perde il
  // riferimento a quale libro si sta guardando.
  const librarySourceTitle =
    location.area === 'library' && location.itemId && librarySourceDetail?.source.id === location.itemId
      ? librarySourceDetail.source.title
      : null;
  // Stesso principio per lo Studio di trascrizione: aperto un documento, il
  // suo titolo resta in vista finché non se ne apre un altro o si torna al
  // catalogo.
  const transcriptionDocumentTitle =
    location.area === 'transcriptions' && location.documentId && transcriptionDetail?.id === location.documentId
      ? transcriptionDetail.title
      : null;
  const dashboardTabLabel =
    dashboardSection === 'search'
      ? t('federation.title')
      : dashboardSection === 'direct'
        ? t('federation.single')
        : null;
  const backToContextLabel = globalArea
    ? t(GLOBAL_AREA_BACK_KEYS[globalArea])
    : dashboardSection
      ? t('dashboard.navHint')
      : t('sidebar.backToWorkspace');

  /**
   * Un segmento del breadcrumb porta **dove dice di portare**: cliccando il
   * workspace si va alla sua home, non "indietro" da dove si veniva. Prima
   * chiudeva il progetto e basta, lasciando l'utente nella posizione
   * precedente — dalla dashboard si tornava in dashboard.
   */
  const handleContextClick = () => {
    if (currentProjectId) closeProject();
    if (globalArea) {
      navigate(GLOBAL_AREA_LOCATIONS[globalArea]());
      return;
    }
    if (dashboardSection) {
      navigate(dashboardLocation());
      return;
    }
    if (projectWorkspace) navigate(workspaceLocation(projectWorkspace.id));
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
                  {/* Sempre la stessa forma, con o senza progetto aperto:
                      icona del workspace quando il segmento è un workspace, poi
                      l'etichetta, e in entrambi i casi si può cliccare. */}
                  <Tooltip label={backToContextLabel}>
                    <button
                      type="button"
                      onClick={handleContextClick}
                      disabled={isProcessing}
                      className="flex min-w-0 items-baseline gap-2 truncate font-display text-lg italic text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-55 md:text-xl"
                    >
                      {!isGlobalAreaContext && projectWorkspace && (
                        // Un'icona non ha linea di base: si appoggia a mano a
                        // quella del testo, sennò la riga si legge disallineata.
                        <span className="shrink-0 translate-y-[0.12em]">
                          <WorkspaceIcon
                            iconKey={projectWorkspace.iconKey}
                            size={16}
                            className="text-editorial-accent"
                          />
                        </span>
                      )}
                      <span className="truncate">{contextLabel}</span>
                    </button>
                  </Tooltip>
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
                ) : dashboardTabLabel ? (
                  <motion.span
                    key="dashboard-section-segment"
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
                      {dashboardTabLabel}
                    </span>
                  </motion.span>
                ) : librarySourceTitle ? (
                  <motion.span
                    key="library-source-segment"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28, ease: EASE_EDITORIAL }}
                    className="flex min-w-0 items-baseline gap-2.5"
                  >
                    <span className="shrink-0 font-display text-lg italic text-editorial-muted md:text-xl">
                      //
                    </span>
                    <span className="min-w-0 max-w-[24rem] truncate font-display text-lg italic text-editorial-muted md:text-xl">
                      {librarySourceTitle}
                    </span>
                  </motion.span>
                ) : transcriptionDocumentTitle ? (
                  <motion.span
                    key="transcription-document-segment"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28, ease: EASE_EDITORIAL }}
                    className="flex min-w-0 items-baseline gap-2.5"
                  >
                    <span className="shrink-0 font-display text-lg italic text-editorial-muted md:text-xl">
                      //
                    </span>
                    <span className="min-w-0 max-w-[24rem] truncate font-display text-lg italic text-editorial-muted md:text-xl">
                      {transcriptionDocumentTitle}
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
