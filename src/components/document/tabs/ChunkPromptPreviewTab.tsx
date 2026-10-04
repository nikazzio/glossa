import { Eye, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PromptMessage } from '../../pipeline/PromptCard';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { useChunkPromptPreview } from '../../../hooks/useChunkPromptPreview';
import { EmptyState, IconButton, PANEL_BODY_CLASSNAME, PanelSection, Select, Spinner } from '../../ui';
import type { TranslationChunk } from '../../../types';

interface ChunkPromptPreviewTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

export function ChunkPromptPreviewTab({ panelId, labelledBy, currentChunk }: ChunkPromptPreviewTabProps) {
  const { t } = useTranslation();
  const stages = usePipelineStore((s) => s.config.stages);
  const enabledStages = useMemo(() => stages.filter((stage) => stage.enabled), [stages]);
  const [selectedStageId, setSelectedStageId] = useState(enabledStages[0]?.id ?? '');
  const { preview, isBuilding, error, isDeeplStage, build, reset } = useChunkPromptPreview(currentChunk);

  useEffect(() => {
    if (!enabledStages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(enabledStages[0]?.id ?? '');
    }
  }, [enabledStages, selectedStageId]);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset() è stabile, va rieseguito solo al cambio chunk/fase
  }, [currentChunk?.id, selectedStageId]);

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className={PANEL_BODY_CLASSNAME}>
      <PanelSection icon={Eye} label={t('promptPreview.title')}>
        <div className="flex items-center gap-2">
          <Select
            id="prompt-preview-stage"
            value={selectedStageId}
            onChange={setSelectedStageId}
            options={enabledStages.map((stage) => ({ value: stage.id, label: stage.name || stage.id }))}
            ariaLabel={t('promptPreview.stageLabel')}
            className="flex-1"
          />
          <IconButton
            size="md"
            tone="default"
            title={t('promptPreview.buildButton')}
            disabled={!currentChunk || !selectedStageId || isBuilding}
            onClick={() => void build(selectedStageId)}
            tooltipSide="left"
          >
            <Wand2 size={13} />
          </IconButton>
        </div>
        {!currentChunk ? (
          <EmptyState icon={<Eye size={28} />} message={t('promptPreview.emptyNoChunk')} />
        ) : isBuilding ? (
          <Spinner label={t('promptPreview.building')} />
        ) : error ? (
          <EmptyState icon={<Eye size={28} />} message={t('promptPreview.buildFailed')} hint={error} />
        ) : preview ? (
          <div className="space-y-4">
            {!isDeeplStage && <PromptMessage label={t('promptPreview.systemLabel')} text={preview.systemPrompt} />}
            <PromptMessage label={t(isDeeplStage ? 'pipeline.deepl.requestBody' : 'promptPreview.userLabel')} text={preview.userPrompt} />
          </div>
        ) : (
          <EmptyState icon={<Eye size={28} />} message={t('promptPreview.emptyBeforeBuild')} />
        )}
      </PanelSection>
    </div>
  );
}
