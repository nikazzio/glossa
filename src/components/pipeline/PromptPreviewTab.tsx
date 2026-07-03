import { Eye, FileText, Info, Languages, Network, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, StageRole } from '../../types';
import { buildPromptPreviewStages, type PromptPreviewBlock, type PromptPreviewStage } from './promptPreview';
import { IconButton } from '../ui';

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

  return (
    <section
      className={`border-l-4 border-y border-editorial-border bg-editorial-bg/75 px-4 py-3 space-y-2 ${
        block.kind === 'static' ? 'border-l-editorial-success/40' : 'border-l-editorial-accent/45'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-sans uppercase tracking-[0.14em] text-editorial-muted">
            {title}
          </span>
          {hint && (
            <IconButton size="xs" title={hint} tooltipSide="bottom">
              <Info size={8} aria-hidden />
            </IconButton>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest ${
            block.kind === 'static'
              ? 'bg-editorial-success/10 text-editorial-success'
              : 'bg-editorial-accent/10 text-editorial-accent'
          }`}
        >
          {block.kind === 'static' ? t('pipeline.promptPreviewStatic') : t('pipeline.promptPreviewRuntime')}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words border-l border-editorial-border/70 bg-editorial-textbox/18 px-3 py-2 text-xs leading-relaxed font-mono text-editorial-ink">
        {block.body}
      </pre>
    </section>
  );
}

function StageSwitch({
  stage,
  label,
  active,
  controls,
  onClick,
}: {
  stage: PromptPreviewStage;
  label: string;
  active: boolean;
  controls: string;
  onClick: () => void;
}) {
  const Icon = STAGE_ICON[stage.role];

  return (
    <IconButton
      size="md"
      tone={active ? 'accent' : 'default'}
      onClick={onClick}
      title={label}
      id={`prompt-preview-tab-${stage.id}`}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
    >
      <Icon size={14} />
    </IconButton>
  );
}

export function PromptPreviewTab({ config }: PromptPreviewTabProps) {
  const { t } = useTranslation();
  const stages = useMemo(() => buildPromptPreviewStages(config), [config]);
  const [activeStageId, setActiveStageId] = useState<string>(() => stages[0]?.id ?? '');

  useEffect(() => {
    if (stages.length === 0) {
      setActiveStageId('');
      return;
    }
    if (!stages.some((stage) => stage.id === activeStageId)) {
      setActiveStageId(stages[0]!.id);
    }
  }, [activeStageId, stages]);

  const activeStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Eye size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.14em] text-editorial-muted">
            {t('pipeline.promptPreviewTitle')}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-editorial-muted">
          {t('pipeline.promptPreviewHint')}
        </p>
      </div>

      {stages.length > 1 && (
        <div role="tablist" aria-label={t('pipeline.promptPreviewTitle')} className="flex flex-wrap gap-2">
          {stages.map((stage) => (
            <StageSwitch
              key={stage.id}
              stage={stage}
              label={t(`pipeline.stageRole.${stage.role}`)}
              active={activeStage?.id === stage.id}
              controls={`prompt-preview-panel-${stage.id}`}
              onClick={() => setActiveStageId(stage.id)}
            />
          ))}
        </div>
      )}

      {activeStage ? (
        <div
          id={`prompt-preview-panel-${activeStage.id}`}
          role="tabpanel"
          aria-labelledby={`prompt-preview-tab-${activeStage.id}`}
          className="space-y-4"
        >
          <div className="space-y-3">
            {activeStage.blocks.map((block) => (
              <PromptBlockCard key={`${activeStage.id}-${block.id}`} block={block} />
            ))}
          </div>
        </div>
      ) : (
        <div className="border-y border-dashed border-editorial-border px-6 py-10 text-center text-sm text-editorial-muted">
          {t('pipeline.promptPreviewEmpty')}
        </div>
      )}
    </div>
  );
}
