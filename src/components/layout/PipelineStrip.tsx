import { Settings2 } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useUiStore } from '../../stores/uiStore';

export function PipelineStrip() {
  const { pipelines, activePipelineId, switchPipeline, createNewPipeline } = useProjectStore();
  const runStatus = usePipelineStore((s) => s.runStatus);
  const { showConfigDrawer, setShowConfigDrawer } = useUiStore();

  return (
    <div className="flex w-12 shrink-0 flex-col items-center border-r border-editorial-border bg-editorial-bg/60 py-3">
      <div className="flex flex-1 flex-col items-center gap-2">
        {pipelines.map((pipeline, i) => {
          const isActive = pipeline.id === activePipelineId;
          const isRunning = isActive && runStatus === 'running';
          return (
            <button
              key={pipeline.id}
              onClick={() => switchPipeline(pipeline.id)}
              title={pipeline.name}
              aria-label={pipeline.name}
              className={`relative flex h-9 w-9 items-center justify-center rounded-[6px] text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                isActive
                  ? 'bg-editorial-accent text-white'
                  : 'border border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
              }`}
            >
              {isRunning ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-white" />
              ) : (
                String(i + 1)
              )}
            </button>
          );
        })}
        {pipelines.length < 10 && (
          <button
            onClick={() => createNewPipeline(`Pipeline ${pipelines.length + 1}`)}
            title="Nuova pipeline"
            aria-label="Nuova pipeline"
            className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-editorial-border text-sm text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            +
          </button>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 pb-1">
        <div className="h-px w-6 bg-editorial-border/60" />
        <button
          onClick={() => setShowConfigDrawer(!showConfigDrawer)}
          title="Configura pipeline"
          aria-label="Configura pipeline"
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
            showConfigDrawer
              ? 'border-editorial-accent bg-editorial-accent text-white'
              : 'border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
          }`}
        >
          <Settings2 size={14} />
        </button>
      </div>
    </div>
  );
}
