import { Bot, Brain, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider } from '../../types';
import { getModelReasoning, getModelUseCaseFit, type ModelUseCase } from '../../models/catalog';

interface ModelCapabilityHintProps {
  provider: ModelProvider;
  model: string;
  useCase?: ModelUseCase;
  useCaseLabel?: string;
}

export function ModelCapabilityHint({
  provider,
  model,
  useCase,
  useCaseLabel,
}: ModelCapabilityHintProps) {
  const { t } = useTranslation();
  const reasoning = getModelReasoning(provider, model);
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

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px]">
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
