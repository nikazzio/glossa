import { Bot, Brain, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider } from '../../types';
import { getModelUseCaseFit, getResolvedModelReasoning, type ModelUseCase } from '../../models/catalog';
import { Tooltip } from '../ui';

interface ModelCapabilityHintProps {
  provider: ModelProvider;
  model: string;
  useCase?: ModelUseCase;
  useCaseLabel?: string;
  iconOnly?: boolean;
}

export function ModelCapabilityHint({
  provider,
  model,
  useCase,
  useCaseLabel,
  iconOnly,
}: ModelCapabilityHintProps) {
  const { t } = useTranslation();
  const reasoning = getResolvedModelReasoning(provider, model);
  const fit = useCase ? getModelUseCaseFit(provider, model, useCase) : undefined;

  if (!reasoning) return null;

  const reasoningMeta = {
    reasoning: {
      Icon: Brain,
      className: 'border-editorial-accent/30 bg-editorial-accent/10 text-editorial-accent',
    },
    non_reasoning: {
      Icon: Bot,
      className: 'border-editorial-success/30 bg-editorial-success/10 text-editorial-success',
    },
    optional: {
      Icon: Wand2,
      className: 'border-editorial-warning/30 bg-editorial-warning/10 text-editorial-warning',
    },
  }[reasoning];

  const fitClassName =
    fit === 'preferred'
      ? 'text-editorial-success'
      : fit === 'discouraged'
        ? 'text-editorial-warning'
        : 'text-editorial-muted/70';

  if (iconOnly) {
    return (
      <Tooltip label={t(`pipeline.modelReasoning.${reasoning}`)}>
        <span className={`inline-flex items-center justify-center rounded-full border p-1 ${reasoningMeta.className}`}>
          <reasoningMeta.Icon size={10} />
        </span>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono ${reasoningMeta.className}`}>
        <reasoningMeta.Icon size={11} />
        {t(`pipeline.modelReasoning.${reasoning}`)}
      </span>
      {fit && useCaseLabel && (
        <span className={fitClassName}>
          {t(`pipeline.modelFit.${fit}`, { target: useCaseLabel })}
        </span>
      )}
    </div>
  );
}
