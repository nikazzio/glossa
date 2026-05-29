import {
  FileText,
  FlaskConical,
  Info,
  Languages,
  Loader2,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Settings2,
  Square,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm } from '../../stores/confirmStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { CostBreakdownPanel } from '../pipeline/CostBadge';

interface PipelineSidebarProps {
  onRunPipeline: () => void;
  onCancelPipeline: () => void;
  onDryRun: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
}

const STAGE_STATUS_TONE = {
  completed: 'border-editorial-success/40 bg-editorial-success/12 text-editorial-success',
  processing: 'border-editorial-running/45 bg-editorial-running/12 text-editorial-running animate-pulse',
  retrying: 'border-editorial-running/45 bg-editorial-running/12 text-editorial-running animate-pulse',
  error: 'border-editorial-accent/40 bg-editorial-accent/10 text-editorial-accent',
  idle: 'border-editorial-border bg-editorial-bg text-editorial-muted',
} as const;

function StageIndicator({ status, icon: Icon }: { status: string; icon: LucideIcon }) {
  const tone =
    status === 'completed' || status === 'processing' || status === 'error' || status === 'retrying'
      ? (status as keyof typeof STAGE_STATUS_TONE)
      : 'idle';
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${STAGE_STATUS_TONE[tone]}`}
      aria-hidden="true"
    >
      <Icon size={13} strokeWidth={1.9} />
    </span>
  );
}

export function PipelineSidebar({
  onRunPipeline,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
}: PipelineSidebarProps) {
  const { t } = useTranslation();
  const { config } = usePipelineStore();
  const runStatus = usePipelineStore((s) => s.runStatus);
  const {
    pipelines,
    activePipelineId,
    currentProjectId,
    switchPipeline,
    createNewPipeline,
    deletePipeline,
  } = useProjectStore();
  const { chunks, isProcessing, cancelRequested } = useChunksStore();
  const {
    pipelineMode,
    setPipelineMode,
    pipelineTestChunkCount,
    setPipelineTestChunkCount,
    showConfigDrawer,
    setShowConfigDrawer,
    selectedChunkId,
    maxPipelines,
    traceStageId,
    setTraceStageId,
  } = useUiStore();
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const [showCostPanel, setShowCostPanel] = useState(false);

  const isRunning = runStatus === 'running';
  const hasProject = !!currentProjectId;
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  const effectivePipelineMode = pipelineMode;
  const runChunkCount =
    effectivePipelineMode === 'test'
      ? Math.max(1, Math.min(pipelineTestChunkCount, chunks.length || 1))
      : chunks.length;
  const canAdjustTestCount = effectivePipelineMode === 'test' && !isProcessing;

  const currentIndex = Math.max(0, chunks.findIndex((c) => c.id === selectedChunkId));
  const currentChunk = chunks[currentIndex] ?? null;

  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  const runPanelClass =
    effectivePipelineMode === 'test'
      ? 'border-editorial-warning/30 bg-editorial-textbox/60'
      : 'border-editorial-border bg-editorial-bg/90';

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
    <div className="flex w-52 shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60">
      {/* Pipeline selector */}
      <div className="flex flex-col gap-1.5 px-3 pt-3">
        {pipelines.length === 0 ? (
          <div
            title={t('pipeline.pipelineNumber', { number: 1 })}
            className="flex h-8 w-full items-center justify-center rounded-[8px] bg-editorial-accent text-xs font-black text-white"
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
                  className={`relative flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    isActive
                      ? 'bg-editorial-accent text-white'
                      : 'border border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
                  }`}
                >
                  <span className="font-black">{i + 1}</span>
                  <span className="truncate">{pipeline.name}</span>
                  {isPipelineRunning && (
                    <span className="ml-auto h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-transparent border-t-current" />
                  )}
                </button>
                {pipelines.length > 1 && !isPipelineRunning && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(pipeline.id, pipeline.name);
                    }}
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
            onClick={() =>
              createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }))
            }
            title={t('pipeline.newPipeline')}
            aria-label={t('pipeline.newPipeline')}
            className="flex w-full items-center justify-center rounded border border-dashed border-editorial-border py-1 text-sm text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            +
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 my-3 h-px bg-editorial-border/60" />

      {/* Run panel */}
      <div className={`mx-3 rounded-[16px] border px-3 py-2.5 ${runPanelClass}`}>
        {/* Pipeline name + stage indicators */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-[9px] font-bold uppercase tracking-wider text-editorial-accent/70">
            {activePipeline?.name ?? '—'}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {config.stages.map((stage) => {
              const Icon: LucideIcon =
                stage.role === 'refine' ? Pencil
                : stage.role === 'format' ? FileText
                : Languages;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() =>
                    stage.enabled &&
                    currentChunk &&
                    setTraceStageId(traceStageId === stage.id ? null : stage.id)
                  }
                  disabled={!stage.enabled || !currentChunk}
                  title={stage.name}
                  aria-label={stage.name}
                  className={`rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed ${
                    !stage.enabled ? 'opacity-25' : ''
                  }`}
                >
                  <StageIndicator
                    status={
                      stage.enabled
                        ? (currentChunk?.stageResults[stage.id]?.status ?? 'idle')
                        : 'idle'
                    }
                    icon={Icon}
                  />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() =>
                currentChunk && setTraceStageId(traceStageId === '_judge' ? null : '_judge')
              }
              disabled={!currentChunk}
              title={t('pipeline.audit')}
              aria-label={t('pipeline.audit')}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed"
            >
              <StageIndicator
                status={currentChunk?.judgeResult.status ?? 'idle'}
                icon={ScanLine}
              />
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="mb-2 flex w-full items-center justify-center rounded-full border border-editorial-border bg-editorial-textbox/40 p-0.5">
          <button
            type="button"
            onClick={() => setPipelineMode('test')}
            disabled={isProcessing}
            title={t('pipeline.modeTestHint')}
            aria-label={t('pipeline.modeTest')}
            className={`flex flex-1 items-center justify-center rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              pipelineMode === 'test'
                ? 'bg-editorial-bg text-editorial-ink shadow-sm'
                : 'text-editorial-muted hover:text-editorial-ink'
            }`}
          >
            <FlaskConical size={12} />
          </button>
          <button
            type="button"
            onClick={() => setPipelineMode('production')}
            disabled={isProcessing}
            title={t('pipeline.modeProductionHint')}
            aria-label={t('pipeline.modeProduction')}
            className={`flex flex-1 items-center justify-center rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              pipelineMode === 'production'
                ? 'bg-editorial-bg text-editorial-charcoal shadow-sm'
                : 'text-editorial-muted hover:text-editorial-ink'
            }`}
          >
            <Zap size={12} />
          </button>
        </div>

        {/* Chunk count + retranslate + run button */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPipelineTestChunkCount(runChunkCount - 1)}
              disabled={!canAdjustTestCount || runChunkCount <= 1}
              title={t('pipeline.decreaseTestChunkCount')}
              aria-label={t('pipeline.decreaseTestChunkCount')}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Minus size={8} />
            </button>
            <div
              className={`flex h-8 min-w-[32px] items-center justify-center rounded-full border px-2 text-xs font-bold tracking-[0.12em] ${
                effectivePipelineMode === 'test'
                  ? 'border-editorial-warning/40 bg-editorial-textbox text-editorial-ink'
                  : 'border-editorial-border bg-editorial-bg text-editorial-ink'
              }`}
              title={t('pipeline.runChunkCount', { count: runChunkCount })}
            >
              {runChunkCount}
            </div>
            <button
              type="button"
              onClick={() => setPipelineTestChunkCount(runChunkCount + 1)}
              disabled={!canAdjustTestCount || runChunkCount >= chunks.length}
              title={t('pipeline.increaseTestChunkCount')}
              aria-label={t('pipeline.increaseTestChunkCount')}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Plus size={8} />
            </button>
            {onRetranslateChunk && currentChunk && (
              <button
                type="button"
                onClick={() => onRetranslateChunk(currentChunk.id)}
                disabled={isProcessing || !currentChunk.originalText.trim()}
                title={effectivePipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')}
                aria-label={effectivePipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>

          {/* Run/Stop button */}
          <div className="relative">
            {isProcessing ? (
              cancelRequested ? (
                <button
                  type="button"
                  disabled
                  title={t('pipeline.stopping')}
                  aria-label={t('pipeline.stopping')}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted opacity-50 focus:outline-none"
                >
                  <Loader2 size={16} className="animate-spin" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCancelPipeline}
                  title={t('pipeline.stopPipeline')}
                  aria-label={t('pipeline.stopPipeline')}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-editorial-accent bg-editorial-bg text-editorial-accent transition-colors hover:bg-editorial-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={effectivePipelineMode === 'test' ? onDryRun : onRunPipeline}
                disabled={isProcessing || chunks.length === 0}
                title={t('pipeline.beginPipeline')}
                aria-label={t('pipeline.beginPipeline')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-editorial-charcoal text-white transition-colors hover:bg-editorial-charcoal/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={16} fill="currentColor" />
              </button>
            )}
            {costEstimate.stages.length > 0 && (
              <div
                className="absolute -bottom-0.5 -right-0.5"
                onMouseEnter={() => setShowCostPanel(true)}
                onMouseLeave={() => setShowCostPanel(false)}
              >
                <button
                  type="button"
                  onFocus={() => setShowCostPanel(true)}
                  onBlur={() => setShowCostPanel(false)}
                  aria-label={t('cost.breakdown')}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal hover:text-editorial-charcoal focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <Info size={8} />
                </button>
              </div>
            )}
            {showCostPanel && costEstimate.stages.length > 0 && (
              <div
                className="absolute bottom-full left-0 z-50 mb-2 w-64"
                onMouseEnter={() => setShowCostPanel(true)}
                onMouseLeave={() => setShowCostPanel(false)}
              >
                <CostBreakdownPanel estimate={costEstimate} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Config button */}
      <div className="flex flex-col items-center gap-2 px-3 pb-3">
        <div className="h-px w-full bg-editorial-border/60" />
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
