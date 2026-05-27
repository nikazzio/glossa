import { Settings2 } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useUiStore } from '../../stores/uiStore';

export function PipelineStrip() {
  const { pipelines, activePipelineId, switchPipeline, createNewPipeline } = useProjectStore();
  const runStatus = usePipelineStore((s) => s.runStatus);
  const { showConfigDrawer, setShowConfigDrawer } = useUiStore();

  return (
    <div className="flex w-8 shrink-0 flex-col items-center border-r border-editorial-border bg-editorial-bg/60 py-2">
      <div className="flex flex-1 flex-col items-center gap-1.5">
        {pipelines.map((pipeline, i) => {
          const isActive = pipeline.id === activePipelineId;
          const isRunning = isActive && runStatus === 'running';
          return (
            <button
              key={pipeline.id}
              onClick={() => switchPipeline(pipeline.id)}
              title={pipeline.name}
              aria-label={pipeline.name}
              className={`relative flex h-5 w-5 items-center justify-center rounded-[4px] text-[8px] font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                isActive
                  ? 'bg-editorial-accent text-white'
                  : 'border border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
              }`}
            >
              {isRunning ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-transparent border-t-white" />
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
            className="flex h-[18px] w-[18px] items-center justify-center rounded border border-dashed border-editorial-border text-[10px] text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            +
          </button>
        )}
      </div>
      <div className="flex flex-col items-center gap-1.5 pb-1">
        <div className="h-px w-4 bg-editorial-border/60" />
        <button
          onClick={() => setShowConfigDrawer(!showConfigDrawer)}
          title="Configura pipeline"
          aria-label="Configura pipeline"
          className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
            showConfigDrawer
              ? 'border-editorial-accent bg-editorial-accent text-white'
              : 'border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
          }`}
        >
          <Settings2 size={10} />
        </button>
      </div>
    </div>
  );
}
