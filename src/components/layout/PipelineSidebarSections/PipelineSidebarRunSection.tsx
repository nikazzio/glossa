import {
  Languages,
  Loader2,
  Minus,
  Play,
  Plus,
  Repeat,
  Square,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useChunksStore } from '../../../stores/chunksStore';
import { useUiStore } from '../../../stores/uiStore';
import { useConfigStore } from '../../../stores/configStore';
import { IconButton, ToggleRow } from '../../ui';

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
  const countEnabled = workMode === 'all' && hasDocument;
  /** «Comando — motivo» quando è spento, come negli Studi. */
  const blockedTitle = (command: string, reason: string | null) =>
    reason ? t('transcription.commandBlocked', { command, reason }) : command;
  const translateChunkTitle = blockedTitle(
    t('pipeline.translateChunk'),
    isProcessing
      ? t('document.reasonRunning')
      : !currentChunk
        ? t('document.reasonNoDocumentToTranslate')
        : !currentChunk.hasSourceText
          ? t('document.reasonNoSourceText')
          : null,
  );
  const runTitle = blockedTitle(runActionLabel, hasDocument ? null : t('document.reasonNoDocumentToTranslate'));

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 pt-1">
        {isProcessing ? (
          cancelRequested ? (
            <IconButton size="md" tone="muted" disabled title={t('pipeline.stopping')} tooltipSide="right" className="h-9 w-9 opacity-50">
              <Loader2 size={15} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton size="md" tone="danger" onClick={onCancelPipeline} title={t('pipeline.stopPipeline')} tooltipSide="right" className="h-9 w-9">
              <Square size={14} fill="currentColor" />
            </IconButton>
          )
        ) : workMode === 'chunk' ? (
          <IconButton size="md" tone="charcoal" onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)} disabled={!currentChunk || !currentChunk.hasSourceText} title={translateChunkTitle} tooltipSide="right" className="h-9 w-9">
            <Languages size={14} />
          </IconButton>
        ) : (
          <IconButton size="md" tone="charcoal" onClick={onRunPipeline} disabled={!hasDocument} title={runTitle} tooltipSide="right" className="h-9 w-9">
            <Play size={14} fill="currentColor" />
          </IconButton>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="relative shrink-0">
        {workMode === 'chunk' ? (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)}
            disabled={isProcessing || !currentChunk || !currentChunk.hasSourceText}
            title={translateChunkTitle}
            ariaLabel={translateChunkTitle}
            tooltipSide="bottom"
            className="h-14 w-14"
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
              className="h-14 w-14"
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
              className="h-14 w-14"
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
            title={runTitle}
            ariaLabel={runTitle}
            tooltipSide="bottom"
            className="h-14 w-14"
          >
            <Play size={22} fill="currentColor" />
          </IconButton>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <ToggleRow
          icon={<Repeat size={14} />}
          label={t('pipeline.repeatModeLabel')}
          checked={workMode === 'all'}
          disabled={isProcessing}
          onChange={() => setWorkMode(workMode === 'all' ? 'chunk' : 'all')}
        />
        {/* Sempre in vista, spento quando si traduce un frammento solo: il
            riquadro non cambia forma accendendo l'interruttore. */}
        <div className="flex items-center gap-1.5">
          <IconButton
            size="sm"
            onClick={decreaseRepeatCount}
            disabled={!countEnabled || !canDecreaseRepeatCount}
            title={t('pipeline.repeatChunkCountDecrease')}
            tooltipSide="bottom"
          >
            <Minus size={11} />
          </IconButton>
          <span
            className={`flex h-7 min-w-7 shrink-0 items-center justify-center font-display text-sm italic tabular-nums ${
              countEnabled ? 'text-editorial-ink' : 'text-editorial-muted'
            }`}
            aria-label={t('pipeline.repeatChunkCountLabel')}
          >
            {effectiveRepeatCount}
          </span>
          <IconButton
            size="sm"
            onClick={increaseRepeatCount}
            disabled={!countEnabled || !canIncreaseRepeatCount}
            title={t('pipeline.repeatChunkCountIncrease')}
            tooltipSide="bottom"
          >
            <Plus size={11} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
