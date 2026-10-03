import { Eye, FileText, Languages, Network, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, StageRole } from '../../types';
import { buildPromptPreviewStages, type PromptPreviewBlock } from './promptPreview';
import { Hint, PanelSection, TabStrip, type TabStripItem } from '../ui';

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
          {/* La spiegazione la porta il titolo del blocco. */}
          {hint ? (
            <Hint label={`${title} — ${hint}`} side="bottom">
              <span className="text-caption font-sans uppercase tracking-section text-editorial-muted">{title}</span>
            </Hint>
          ) : (
            <span className="text-caption font-sans uppercase tracking-section text-editorial-muted">{title}</span>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-caption font-bold uppercase tracking-widest ${
            block.kind === 'static'
              ? 'bg-editorial-success/10 text-editorial-success'
              : 'bg-editorial-accent/10 text-editorial-accent'
          }`}
        >
          {block.kind === 'static' ? t('pipeline.promptPreviewStatic') : t('pipeline.promptPreviewRuntime')}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words border-l border-rule bg-editorial-textbox/18 px-3 py-2 text-xs leading-relaxed font-mono text-editorial-ink">
        {block.body}
      </pre>
    </section>
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

  const stageTabs: TabStripItem[] = stages.map((stage) => {
    const Icon = STAGE_ICON[stage.role];
    return { id: stage.id, label: t(`pipeline.stageRole.${stage.role}`), icon: <Icon size={14} /> };
  });

  return (
    <div className="space-y-6">
      <PanelSection
        icon={Eye}
        label={t('pipeline.promptPreviewTitle')}
        hint={t('pipeline.promptPreviewHint')}
        actions={stages.length > 1 && activeStage ? (
          <TabStrip
            tabs={stageTabs}
            activeId={activeStage.id}
            onChange={setActiveStageId}
            ariaLabel={t('pipeline.promptPreviewTitle')}
            idPrefix="prompt-preview"
          />
        ) : undefined}
      >
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
      </PanelSection>
    </div>
  );
}
