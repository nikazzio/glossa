import { lazy, Suspense } from 'react';
import { Header } from './components/layout';
import { ErrorBoundary, ConfirmDialog } from './components/common';
import { usePipeline } from './hooks/usePipeline';
import { useProjectAutosave } from './hooks/useProjectAutosave';
import { useUiStore } from './stores/uiStore';
import { Toaster } from 'sonner';

const PipelineConfig = lazy(() =>
  import('./components/pipeline').then((m) => ({ default: m.PipelineConfig })),
);
const ProductionStream = lazy(() =>
  import('./components/pipeline').then((m) => ({ default: m.ProductionStream })),
);
const AuditPanel = lazy(() =>
  import('./components/audit').then((m) => ({ default: m.AuditPanel })),
);
const ConfigDrawer = lazy(() =>
  import('./components/document').then((m) => ({ default: m.ConfigDrawer })),
);
const DocumentView = lazy(() =>
  import('./components/document').then((m) => ({ default: m.DocumentView })),
);
const InsightsDrawer = lazy(() =>
  import('./components/document').then((m) => ({ default: m.InsightsDrawer })),
);
const SettingsModal = lazy(() =>
  import('./components/settings').then((m) => ({ default: m.SettingsModal })),
);
const ProjectPanel = lazy(() =>
  import('./components/projects').then((m) => ({ default: m.ProjectPanel })),
);
const LibraryPanel = lazy(() =>
  import('./components/library').then((m) => ({ default: m.LibraryPanel })),
);

export default function App() {
  const {
    runPipeline,
    runAuditOnly,
    runSingleChunk,
    auditSingleChunk,
    cancelPipeline,
  } = usePipeline();
  useProjectAutosave();
  const viewMode = useUiStore((state) => state.viewMode);

  return (
    <ErrorBoundary>
      <div className="h-screen overflow-hidden bg-editorial-bg text-editorial-ink font-sans flex flex-col">
        <div className="flex-shrink-0">
          <Header
            onRunPipeline={runPipeline}
            onCancelPipeline={cancelPipeline}
          />
        </div>

        <Suspense fallback={null}>
          {viewMode === 'document' ? (
            <main className="flex flex-1 min-h-0 overflow-hidden">
              <DocumentView
                onRetranslateChunk={runSingleChunk}
                onReauditChunk={auditSingleChunk}
              />
              <InsightsDrawer onReauditChunk={auditSingleChunk} />
            </main>
          ) : (
            <main className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0">
              <PipelineConfig
                onRunPipeline={runPipeline}
                onRunAuditOnly={runAuditOnly}
                onCancelPipeline={cancelPipeline}
              />
              <ProductionStream
                onRetranslateChunk={runSingleChunk}
                onReauditChunk={auditSingleChunk}
              />
              <AuditPanel
                onRunAuditOnly={runAuditOnly}
                onReauditChunk={auditSingleChunk}
              />
            </main>
          )}

          {viewMode === 'document' && (
            <ConfigDrawer
              onRunPipeline={runPipeline}
              onRunAuditOnly={runAuditOnly}
              onCancelPipeline={cancelPipeline}
            />
          )}

          <SettingsModal />
          <ProjectPanel />
          <LibraryPanel />
        </Suspense>

        <ConfirmDialog />
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-sans, system-ui)',
            fontSize: '12px',
          },
        }}
        richColors
        closeButton
      />
    </ErrorBoundary>
  );
}
