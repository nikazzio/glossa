import { ChevronRight, Eye, FileText, Languages, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, StageRole } from '../../types';
import { buildPromptPreviewStages, type PromptPreviewBlock, type PromptPreviewStage } from './promptPreview';

interface PromptPreviewTabProps {
  config: PipelineConfig;
}

const STAGE_ICON: Record<StageRole, typeof Languages> = {
  translation: Languages,
  refine: Wand2,
  format: FileText,
};

function PromptBlockCard({ block }: { block: PromptPreviewBlock }) {
  return (
    <section className="rounded-[18px] border border-editorial-border bg-editorial-bg/75 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
          {block.title}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
            block.kind === 'static'
              ? 'bg-editorial-success/10 text-editorial-success'
              : 'bg-editorial-accent/10 text-editorial-accent'
          }`}
        >
          {block.kind === 'static' ? 'Static' : 'Runtime'}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono text-editorial-ink">
        {block.body}
      </pre>
    </section>
  );
}

function StageSwitch({
  stage,
  label,
  active,
  onClick,
}: {
  stage: PromptPreviewStage;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = STAGE_ICON[stage.role];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        active
          ? 'border-editorial-accent bg-editorial-accent text-white'
          : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </span>
    </button>
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
    <div id="pconfig-panel-preview" role="tabpanel" aria-labelledby="pconfig-tab-preview" className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Eye size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
            {t('pipeline.promptPreviewTitle')}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-editorial-muted">
          {t('pipeline.promptPreviewHint')}
        </p>
      </div>

      {stages.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {stages.map((stage) => (
            <StageSwitch
              key={stage.id}
              stage={stage}
              label={t(`pipeline.stageRole.${stage.role}`)}
              active={activeStage?.id === stage.id}
              onClick={() => setActiveStageId(stage.id)}
            />
          ))}
        </div>
      )}

      {activeStage ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-ink">
              {t(`pipeline.stageRole.${activeStage.role}`)}
            </span>
            <ChevronRight size={12} className="text-editorial-muted" />
            <span className="text-[10px] font-mono text-editorial-muted">{activeStage.name}</span>
          </div>
          <div className="space-y-3">
            {activeStage.blocks.map((block) => (
              <PromptBlockCard key={`${activeStage.id}-${block.title}`} block={block} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-editorial-border px-6 py-10 text-center text-sm text-editorial-muted">
          {t('pipeline.promptPreviewEmpty')}
        </div>
      )}
    </div>
  );
}
