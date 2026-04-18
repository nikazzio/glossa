import { Header } from './components/layout';
import { PipelineConfig, ProductionStream } from './components/pipeline';
import { AuditPanel } from './components/audit';
import { SettingsModal } from './components/settings';
import { ErrorBoundary } from './components/common';
import { usePipeline } from './hooks/usePipeline';
import { Toaster } from 'sonner';

export default function App() {
  const { runPipeline, runAuditOnly } = usePipeline();

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-editorial-bg text-editorial-ink font-sans">
        <Header />

        <main className="grid grid-cols-1 md:grid-cols-12 min-h-[calc(100vh-140px)]">
          <PipelineConfig onRunPipeline={runPipeline} onRunAuditOnly={runAuditOnly} />
          <ProductionStream />
          <AuditPanel onRunAuditOnly={runAuditOnly} />
        </main>

        <SettingsModal />
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
