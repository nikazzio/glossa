import {
  FileText,
  Languages,
  Loader2,
  Minus,
  Pencil,
  Play,
  Plus,
  Repeat,
  ScanLine,
  Square,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useChunksStore } from '../../../stores/chunksStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { useUiStore } from '../../../stores/uiStore';
import { useConfigStore } from '../../../stores/configStore';
import type { PipelineConfig } from '../../../types';
import { STAGE_TONE_MAP } from '../../document/pipelineStageTone';
import { IconButton, Tooltip } from '../../ui';

/**
 * Spie di stato delle fasi pipeline (bozza/rifinitura/formattazione/audit) sul
 * frammento corrente — stanno accanto al pulsante di traduzione perché
 * parlano della stessa cosa: cosa succede quando lo premi.
 */
function PipelineStageStatusRow({ config }: { config: PipelineConfig }) {
  const { t } = useTranslation();
  const chunks = useChunksStore((state) => state.chunks);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const traceStageId = useUiStore((state) => state.traceStageId);
  const setTraceStageId = useUiStore((state) => state.setTraceStageId);

  const currentChunk = chunks.find((chunk) => chunk.id === selectedChunkId) ?? chunks[0] ?? null;
  if (!currentChunk) return null;

  const enabledStages = config.stages.filter((stage) => stage.enabled);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5">
      {enabledStages.map((stage) => {
        const Icon = stage.role === 'refine' ? Pencil : stage.role === 'format' ? FileText : Languages;
        const stageTone = STAGE_TONE_MAP[currentChunk.stageResults[stage.id]?.status ?? 'idle'] ?? 'muted';
        return (
          <IconButton
            key={stage.id}
            size="sm"
            tone={stageTone}
            title={stage.name}
            onClick={() => setTraceStageId(traceStageId === stage.id ? null : stage.id)}
          >
            <Icon size={12} strokeWidth={1.9} />
          </IconButton>
        );
      })}
      <IconButton
        size="sm"
        tone={STAGE_TONE_MAP[currentChunk.judgeResult.status ?? 'idle'] ?? 'muted'}
        title={t('pipeline.audit')}
        onClick={() => setTraceStageId(traceStageId === '_judge' ? null : '_judge')}
      >
        <ScanLine size={12} strokeWidth={1.9} />
      </IconButton>
    </div>
  );
}

export function PipelineSidebarRunSection({
  collapsed = false,
  onRunPipeline,
  onCancelPipeline,
  onRetranslateChunk,
}: {
  collapsed?: boolean;
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
}) {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const workMode = useConfigStore((state) => state.workMode);
  const setWorkMode = useConfigStore((state) => state.setWorkMode);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const cancelRequested = useChunksStore((state) => state.cancelRequested);
  const totalChunks = useChunksStore((state) => state.chunks.length);
  const repeatChunkCount = useConfigStore((state) => state.repeatChunkCount);
  const setRepeatChunkCount = useConfigStore((state) => state.setRepeatChunkCount);
  const isLimitedRun = repeatChunkCount !== null && repeatChunkCount < totalChunks;
  // Se l'utente ha impostato un numero, il run reale si ferma lì: tooltip e
  // contatore devono riflettere quel numero, non l'intero documento.
  const runChunkCount = isLimitedRun ? repeatChunkCount : totalChunks;
  // Senza limite esplicito il contatore mostra il totale (equivale a "tutti");
  // +/- partono sempre da un numero concreto, mai da un valore vuoto.
  const effectiveRepeatCount = repeatChunkCount ?? totalChunks;
  const canDecreaseRepeatCount = !isProcessing && effectiveRepeatCount > 1;
  const canIncreaseRepeatCount = !isProcessing && effectiveRepeatCount < totalChunks;
  const decreaseRepeatCount = () => setRepeatChunkCount(Math.max(1, effectiveRepeatCount - 1));
  const increaseRepeatCount = () => {
    const next = effectiveRepeatCount + 1;
    // Tornare al totale del documento equivale a "nessun limite".
    setRepeatChunkCount(next >= totalChunks ? null : next);
  };
  const completedCount = useChunksStore((state) =>
    state.chunks.slice(0, runChunkCount).reduce(
      (count, chunk) => count + (chunk.status === 'completed' ? 1 : 0),
      0,
    ),
  );
  const runActionLabel = isLimitedRun
    ? t('pipeline.executeLimited', { count: runChunkCount })
    : t('pipeline.executeAll');
  const currentChunk = useChunksStore(
    useShallow((state) => {
      const chunk = state.chunks.find((entry) => entry.id === selectedChunkId);
      return chunk
        ? { id: chunk.id, hasSourceText: chunk.sourceProcessingText.trim().length > 0, sourceText: chunk.sourceProcessingText }
        : null;
    }),
  );

  const hasDocument = totalChunks > 0;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 pt-1">
        {isProcessing ? (
          cancelRequested ? (
            <IconButton size="md" tone="muted" disabled title={t('pipeline.stopping')} tooltipSide="right" className="h-9 w-9 opacity-50">
              <Loader2 size={15} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton size="md" tone="default" onClick={onCancelPipeline} title={t('pipeline.stopPipeline')} tooltipSide="right" className="h-9 w-9 border-editorial-danger bg-editorial-bg text-editorial-danger hover:bg-editorial-danger/10">
              <Square size={14} fill="currentColor" />
            </IconButton>
          )
        ) : workMode === 'chunk' ? (
          <IconButton size="md" tone="charcoal" onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)} disabled={!currentChunk || !currentChunk.hasSourceText} title={t('pipeline.translateChunk')} tooltipSide="right" className="h-9 w-9">
            <Languages size={14} />
          </IconButton>
        ) : (
          <IconButton size="md" tone="charcoal" onClick={onRunPipeline} disabled={!hasDocument} title={runActionLabel} tooltipSide="right" className="h-9 w-9">
            <Play size={14} fill="currentColor" />
          </IconButton>
        )}
        {workMode === 'all' && hasDocument && (
          <span className="text-xs font-bold tabular-nums tracking-[0.1em] text-editorial-muted">
            {completedCount}/{runChunkCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative shrink-0">
        {workMode === 'chunk' ? (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)}
            disabled={isProcessing || !currentChunk || !currentChunk.hasSourceText}
            title={t('pipeline.translateChunk')}
            ariaLabel={t('pipeline.translateChunk')}
            tooltipSide="bottom"
            className="h-14 w-14 border-editorial-charcoal/40 bg-editorial-bg hover:border-editorial-charcoal/65 hover:bg-editorial-textbox/70"
          >
            <Languages size={22} />
          </IconButton>
        ) : isProcessing ? (
          cancelRequested ? (
            <IconButton
              size="md"
              tone="default"
              disabled
              title={t('pipeline.stopping')}
              tooltipSide="bottom"
              className="h-14 w-14 bg-editorial-bg opacity-50"
            >
              <Loader2 size={22} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton
              size="md"
              tone="danger"
              onClick={onCancelPipeline}
              title={t('pipeline.stopPipeline')}
              ariaLabel={t('pipeline.stopPipeline')}
              tooltipSide="bottom"
              className="h-14 w-14 bg-editorial-bg"
            >
              <Square size={20} fill="currentColor" />
            </IconButton>
          )
        ) : (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={onRunPipeline}
            disabled={!hasDocument}
            title={runActionLabel}
            ariaLabel={runActionLabel}
            tooltipSide="bottom"
            className="h-14 w-14 border-editorial-charcoal/40 bg-editorial-bg hover:border-editorial-charcoal/65 hover:bg-editorial-textbox/70"
          >
            <Play size={22} fill="currentColor" />
          </IconButton>
        )}
      </div>

      <PipelineStageStatusRow config={config} />

      <div className="flex min-w-0 shrink-0 flex-col items-end gap-1.5">
        {/* Altezza fissa: sempre presente per non spostare il pulsante
            principale quando si accende/spegne il toggle sopra. */}
        <div className="flex h-7 items-center gap-1.5">
          {workMode === 'all' && hasDocument ? (
            <>
              <IconButton
                size="sm"
                tone="default"
                onClick={decreaseRepeatCount}
                disabled={!canDecreaseRepeatCount}
                title={t('pipeline.repeatChunkCountDecrease')}
                ariaLabel={t('pipeline.repeatChunkCountDecrease')}
                tooltipSide="bottom"
                className="h-6 w-6 bg-editorial-bg"
              >
                <Minus size={11} />
              </IconButton>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-editorial-accent/35 bg-editorial-accent/10 font-display text-sm italic text-editorial-accent tabular-nums"
                aria-label={t('pipeline.repeatChunkCountLabel')}
              >
                {effectiveRepeatCount}
              </span>
              <IconButton
                size="sm"
                tone="default"
                onClick={increaseRepeatCount}
                disabled={!canIncreaseRepeatCount}
                title={t('pipeline.repeatChunkCountIncrease')}
                ariaLabel={t('pipeline.repeatChunkCountIncrease')}
                tooltipSide="bottom"
                className="h-6 w-6 bg-editorial-bg"
              >
                <Plus size={11} />
              </IconButton>
            </>
          ) : null}
        </div>
        <Tooltip label={t('pipeline.repeatModeLabel')} side="bottom">
          <button
            type="button"
            role="switch"
            aria-label={t('pipeline.repeatModeLabel')}
            aria-checked={workMode === 'all'}
            disabled={isProcessing}
            onClick={() => setWorkMode(workMode === 'all' ? 'chunk' : 'all')}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              workMode === 'all' ? 'bg-editorial-accent' : 'bg-editorial-border'
            }`}
          >
            <span
              className={`inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                workMode === 'all' ? 'translate-x-6' : 'translate-x-0'
              }`}
            >
              <Repeat size={14} className={workMode === 'all' ? 'text-editorial-accent' : 'text-editorial-muted'} />
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
