import { FileText, Languages, Pencil, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useUiStore } from '../../stores/uiStore';
import { IconButton } from '../ui';
import { STAGE_TONE_MAP } from './pipelineStageTone';

/**
 * Spie delle fasi (traduzione, revisione, formattazione, audit) sul frammento
 * aperto: dicono lo stato di quel frammento, quindi stanno nella fila dei
 * pallini. Un clic apre il dettaglio della fase.
 */
export function StageStatusRow() {
  const config = usePipelineStore((state) => state.config);
  const { t } = useTranslation();
  const chunks = useChunksStore((state) => state.chunks);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const traceStageId = useUiStore((state) => state.traceStageId);
  const setTraceStageId = useUiStore((state) => state.setTraceStageId);

  const currentChunk = chunks.find((chunk) => chunk.id === selectedChunkId) ?? chunks[0] ?? null;
  if (!currentChunk) return null;

  const enabledStages = config.stages.filter((stage) => stage.enabled);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
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
