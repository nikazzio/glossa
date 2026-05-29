import { Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';

export function PipelineStrip() {
  const { t } = useTranslation();
  const { pipelines, activePipelineId, currentProjectId, switchPipeline, createNewPipeline, deletePipeline } = useProjectStore();
  const runStatus = usePipelineStore((s) => s.runStatus);
  const { showConfigDrawer, setShowConfigDrawer, maxPipelines } = useUiStore();

  const hasProject = !!currentProjectId;
  const isRunning = runStatus === 'running';

  const handleDelete = async (pipelineId: string, pipelineName: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmDeleteTitle'),
      message: t('pipeline.confirmDeleteMessage', { name: pipelineName }),
      confirmLabel: t('pipeline.deletePipeline'),
      danger: true,
    });
    if (!ok) return;
    await deletePipeline(pipelineId);
  };

  return (
    <div className="flex w-12 shrink-0 flex-col items-center border-r border-editorial-border bg-editorial-bg/60 py-3">
      <div className="flex flex-1 flex-col items-center gap-2">
        {pipelines.length === 0 ? (
          <div
            title={t('pipeline.pipelineNumber', { number: 1 })}
            aria-label={t('pipeline.pipelineNumber', { number: 1 })}
            className="relative flex h-9 w-9 items-center justify-center rounded-[6px] bg-editorial-accent text-xs font-black text-white"
          >
            1
          </div>
        ) : (
          pipelines.map((pipeline, i) => {
            const isActive = pipeline.id === activePipelineId;
            const isPipelineRunning = isActive && isRunning;
            return (
              <div key={pipeline.id} className="group relative">
                <button
                  onClick={() => switchPipeline(pipeline.id)}
                  title={pipeline.name}
                  aria-label={pipeline.name}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-[6px] text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    isActive
                      ? 'bg-editorial-accent text-white'
                      : 'border border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
                  }`}
                >
                  {isPipelineRunning ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-white" />
                  ) : (
                    String(i + 1)
                  )}
                </button>
                {pipelines.length > 1 && !isPipelineRunning && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDelete(pipeline.id, pipeline.name); }}
                    title={t('pipeline.deletePipeline')}
                    aria-label={t('pipeline.deletePipeline')}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none group-hover:flex"
                  >
                    <X size={8} />
                  </button>
                )}
              </div>
            );
          })
        )}
        {hasProject && pipelines.length > 0 && pipelines.length < maxPipelines && (
          <button
            onClick={() => createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }))}
            title={t('pipeline.newPipeline')}
            aria-label={t('pipeline.newPipeline')}
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
          title={t('pipeline.configurePipeline')}
          aria-label={t('pipeline.configurePipeline')}
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
