import { Header } from './components/layout';
import { PipelineConfig, ProductionStream } from './components/pipeline';
import { AuditPanel } from './components/audit';
import { ConfigDrawer, DocumentView, InsightsDrawer } from './components/document';
import { SettingsModal } from './components/settings';
import { ProjectPanel } from './components/projects';
import { ErrorBoundary, ConfirmDialog } from './components/common';
import { usePipeline } from './hooks/usePipeline';
import { useProjectAutosave } from './hooks/useProjectAutosave';
import { useUiStore } from './stores/uiStore';
import { Toaster } from 'sonner';

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
            onRunAuditOnly={runAuditOnly}
            onCancelPipeline={cancelPipeline}
          />
        </div>

        {viewMode === 'document' ? (
          <main className="flex flex-1 min-h-0 overflow-hidden">
            <DocumentView
              onRetranslateChunk={runSingleChunk}
              onReauditChunk={auditSingleChunk}
              onRunAuditOnly={runAuditOnly}
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
