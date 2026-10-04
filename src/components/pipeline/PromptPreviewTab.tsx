import { Braces, Eye, FileText, Languages, Link2, Network, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, PipelineStageConfig, PromptInfo, StageRole } from '../../types';
import { llmService } from '../../services/llmService';
import { deeplService } from '../../services/deeplService';
import { getDeeplOptions } from '../../pipeline/deeplConfig';
import { buildPromptPreviewStages, type PromptPreviewBlock } from './promptPreview';
import { Hint, PanelSection, TabStrip, type TabStripItem } from '../ui';
import { PromptMessage } from './PromptCard';

interface PromptPreviewTabProps {
  config: PipelineConfig;
}

const STAGE_ICON: Record<StageRole, typeof Languages> = {
  'deepl-translation': Network,
  translation: Languages,
  refine: Wand2,
  format: FileText,
};

function PromptBlockCard({ block }: { block: PromptPreviewBlock }) {
  const { t } = useTranslation();
  const title = t(`pipeline.promptPreviewBlocks.${block.id}.title`);
  const hint = t(`pipeline.promptPreviewBlocks.${block.id}.hint`, '');
  const KindIcon = block.kind === 'static' ? FileText : Braces;
  const kindLabel = t(block.kind === 'static' ? 'pipeline.promptPreviewStatic' : 'pipeline.promptPreviewRuntime');

  return <PromptMessage label={title} hint={hint} text={block.body}
    metadata={<Hint label={kindLabel}><KindIcon size={13} aria-hidden="true" /></Hint>} />;
}

function DeeplRequestPreview({ stage }: { stage: PipelineStageConfig }) {
  const { t } = useTranslation();
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setBody(null);
    setError(null);
    void deeplService.previewDeeplStage({
      text: '{{SOURCE_CHUNK_TEXT}}',
      deeplConfig: getDeeplOptions(stage),
    }).then((body) => {
      if (active) setBody(body);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { active = false; };
  }, [stage]);

  if (error) return <p role="alert" className="text-sm text-editorial-danger">{error}</p>;
  if (body === null) return <p className="text-sm text-editorial-muted">{t('common.loading')}</p>;
  return <PromptBlockCard block={{ id: 'deepl-request', body, kind: 'runtime' }} />;
}

type AssembledPreviewProps = { config: PipelineConfig } & (
  | { kind: 'stage'; stage: PipelineStageConfig }
  | { kind: 'audit' | 'coherence'; stage?: undefined }
);

function AssembledPromptPreview({ config, kind, stage }: AssembledPreviewProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setPrompt(null);
    setError(null);
    const isFormat = stage?.role === 'format';
    const request = kind === 'stage'
      ? llmService.previewStagePrompt(
          isFormat ? '{{TEXT_TO_FORMAT}}' : '{{SOURCE_CHUNK_TEXT}}',
          config.usePhraseMemory ? { ...stage, prompt: `${stage.prompt}\n\n{{PHRASE_MEMORY_REFERENCES}}` } : stage,
          {
            ...config,
            ...(!isFormat ? { blobContext: '{{BLOB_CONTEXT}}', blobCurrentChunkId: '{{CURRENT_CHUNK_ID}}' } : {}),
          },
          stage.role === 'refine' ? '{{PREVIOUS_STAGE_RESULT}}' : undefined,
        )
      : kind === 'audit'
      ? llmService.previewJudgePrompt('{{SOURCE_CHUNK_TEXT}}', '{{TRANSLATION}}', config)
      : llmService.previewCoherencePrompt({
          original: '{{SOURCE_CHUNK_TEXT}}',
          translation: '{{TRANSLATION}}',
          blobContext: '{{TRANSLATED_BLOB_CONTEXT}}',
          currentChunkId: '{{CURRENT_CHUNK_ID}}',
        }, config);
    void request.then((prompt) => {
      if (active) setPrompt(prompt);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { active = false; };
  }, [config, kind, stage]);

  if (error) return <p role="alert" className="text-sm text-editorial-danger">{error}</p>;
  if (!prompt) return <p className="text-sm text-editorial-muted">{t('common.loading')}</p>;
  return <>
    <PromptBlockCard block={{ id: 'system-message', body: prompt.systemPrompt, kind: kind === 'audit' ? 'static' : 'runtime' }} />
    <PromptBlockCard block={{ id: 'user-message', body: prompt.userPrompt, kind: 'runtime' }} />
  </>;
}

export function PromptPreviewTab({ config }: PromptPreviewTabProps) {
  const { t } = useTranslation();
  const stages = useMemo(() => buildPromptPreviewStages(config), [config]);
  const [activeStageId, setActiveStageId] = useState<string>(() => stages.find((stage) => stage.enabled)?.id ?? 'preview-audit');
  const [view, setView] = useState('complete');

  useEffect(() => {
    if (!stages.some((stage) => stage.id === activeStageId && stage.enabled) && activeStageId !== 'preview-audit' && activeStageId !== 'preview-coherence') {
      setActiveStageId(stages.find((stage) => stage.enabled)?.id ?? 'preview-audit');
    }
  }, [activeStageId, stages]);

  const activeStage = stages.find((stage) => stage.id === activeStageId);
  const configuredStage = config.stages.find((stage) => stage.id === activeStageId);
  const reviewKind = activeStageId === 'preview-audit' ? 'audit' : activeStageId === 'preview-coherence' ? 'coherence' : null;
  const deeplStage = config.stages.find((stage) => stage.id === activeStage?.id && stage.provider === 'deepl');

  const stageTabs: TabStripItem[] = stages.map((stage) => {
    const Icon = STAGE_ICON[stage.role];
    const label = t(`pipeline.stageRole.${stage.role}`);
    return { id: stage.id, label: stage.enabled ? label : `${label} — ${t('pipeline.phaseNotUsed')}`,
      disabled: !stage.enabled, icon: <Icon size={14} /> };
  });
  stageTabs.push(
    { id: 'preview-audit', label: t('pipeline.auditPreviewLabel'), icon: <ShieldCheck size={14} /> },
    { id: 'preview-coherence', label: t('pipeline.coherencePreviewLabel'), icon: <Link2 size={14} /> },
  );

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Eye}
        label={t('pipeline.promptPreviewTitle')}
        hint={t('pipeline.promptPreviewHint')}
        actions={
          <TabStrip
            tabs={stageTabs}
            activeId={activeStageId}
            onChange={setActiveStageId}
            ariaLabel={t('pipeline.promptPreviewTitle')}
            idPrefix="prompt-preview"
          />
        }
      >
      {activeStage || reviewKind ? (
        <div
          id={`prompt-preview-panel-${activeStageId}`}
          role="tabpanel"
          aria-labelledby={`prompt-preview-tab-${activeStageId}`}
          className="space-y-4"
        >
          <div className="space-y-3">
            {!reviewKind && !deeplStage && <div className="flex items-center gap-3">
              <TabStrip tabs={[
                { id: 'complete', label: t('pipeline.completePrompt'), icon: <Eye size={14} /> },
                { id: 'construction', label: t('pipeline.promptConstruction'), icon: <Braces size={14} /> },
              ]} activeId={view} onChange={setView} ariaLabel={t('pipeline.promptViewLabel')} idPrefix="prompt-view" />
              <span className="font-display italic text-editorial-ink">{t(view === 'complete' ? 'pipeline.completePrompt' : 'pipeline.promptConstruction')}</span>
            </div>}
            {reviewKind ? <AssembledPromptPreview key={reviewKind} config={config} kind={reviewKind} />
              : deeplStage ? <DeeplRequestPreview key={deeplStage.id} stage={deeplStage} />
              : <div id={`prompt-view-panel-${view}`} role="tabpanel" aria-labelledby={`prompt-view-tab-${view}`} className="space-y-3">
                  {view === 'complete' && configuredStage
                    ? <AssembledPromptPreview key={configuredStage.id} config={config} kind="stage" stage={configuredStage} />
                    : activeStage?.blocks.map((block) => <PromptBlockCard key={`${activeStageId}-${block.id}`} block={block} />)}
                </div>}
          </div>
        </div>
      ) : (
        <div className="border-y border-dashed border-editorial-border px-6 py-10 text-center text-sm text-editorial-muted">
          {t('pipeline.promptPreviewEmpty')}
        </div>
      )}
      </PanelSection>
    </div>
  );
}
