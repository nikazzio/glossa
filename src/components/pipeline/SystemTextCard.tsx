import { Lock, LockOpen } from 'lucide-react';
import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, PromptPart, SystemTextInfo } from '../../types';
import { confirm } from '../../stores/confirmStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { IconButton } from '../ui';
import { PipelinePromptEditor } from './PipelinePromptEditor';
import { PromptMessage } from './PromptCard';
import { CommandRule, PromptSourceIcon } from './PromptSourceLabel';
import { describePromptSource } from './promptSource';
import { GUARDED_TEXTS, SHARED_TEXTS } from './promptParts';

/** Una sostituzione uguale al predefinito non si salva: il testo torna a seguire il predefinito. */
function withSystemText(config: PipelineConfig, id: string, text: string, defaultText: string): PipelineConfig {
  const others = Object.fromEntries(Object.entries(config.promptComposition?.texts ?? {}).filter(([key]) => key !== id));
  const texts = text.trim() === defaultText.trim() ? others : { ...others, [id]: text };
  return { ...config, promptComposition: { ...config.promptComposition, texts } };
}

interface SystemTextCardProps {
  part: PromptPart;
  textId: string;
  info: SystemTextInfo;
  title: string;
  hint: string;
  kind: ReactNode;
  /** Comandi accanto al lucchetto, per esempio l'apertura della scheda del contenuto. */
  commands?: ReactNode;
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  disabledReason?: string;
}

/**
 * Un testo di sistema nell'anteprima: si legge come gli altri pezzi; il
 * lucchetto lo apre alla modifica (bozza, template della libreria, bacchetta,
 * ripristino). Il lucchetto si richiude quando la finestra si chiude: è una
 * protezione, non un'impostazione.
 */
export function SystemTextCard({ part, textId, info, title, hint, kind, commands, config, setConfig, disabledReason }: SystemTextCardProps) {
  const { t } = useTranslation();
  const [unlocked, setUnlocked] = useState(false);
  const templates = usePromptTemplateStore((s) => s.templates).filter((tmpl) => tmpl.context === 'system');
  const saveTemplate = usePromptTemplateStore((s) => s.saveTemplate);
  const { statuses } = useProviderKeyStatus();
  const refineStage = config.stages.find((stage) => stage.enabled && stage.provider !== 'deepl');
  const provider = refineStage?.provider ?? config.judgeProvider;
  const model = refineStage?.model ?? config.judgeModel;

  const value = config.promptComposition?.texts?.[textId] ?? info.defaultText;
  const shared = SHARED_TEXTS[textId];
  const fullHint = [hint, shared ? t(`pipeline.promptParts.${shared}`) : ''].filter(Boolean).join(' — ');
  const source = <PromptSourceIcon source={describePromptSource(value, templates, info.defaultText)} />;

  const unlock = async () => {
    if (GUARDED_TEXTS.has(textId)) {
      const ok = await confirm({
        title: t('pipeline.promptParts.unlockGuardedTitle'),
        message: t('pipeline.promptParts.unlockGuardedMessage'),
        confirmLabel: t('pipeline.promptParts.unlock'),
      });
      if (!ok) return;
    }
    setUnlocked(true);
  };

  const lockButton = unlocked
    ? <IconButton size="sm" tone="accent" ariaPressed title={t('pipeline.promptParts.lock')} onClick={() => setUnlocked(false)}><LockOpen size={14} /></IconButton>
    : <IconButton size="sm" ariaPressed={false} disabled={Boolean(disabledReason)}
        title={disabledReason ? t('transcription.commandBlocked', { command: t('pipeline.promptParts.unlock'), reason: disabledReason }) : t('pipeline.promptParts.unlock')}
        onClick={() => void unlock()}><Lock size={14} /></IconButton>;

  if (!unlocked) {
    return <PromptMessage label={title} hint={fullHint} text={part.text.trim()} metadata={<>{kind}{source}<CommandRule />{commands}{lockButton}<CommandRule /></>} />;
  }

  return (
    <PipelinePromptEditor
      label={title}
      hint={fullHint}
      value={value}
      placeholder={info.defaultText}
      templates={templates}
      templateContext="system"
      saveTemplate={saveTemplate}
      onConfirm={(text) => setConfig((prev) => withSystemText(prev, textId, text, info.defaultText))}
      defaultValue={info.defaultText}
      required
      requiredPlaceholders={info.required}
      disabledReason={disabledReason}
      provider={provider}
      model={model}
      canRefine={canRefineWithProvider(provider, statuses)}
      refineLabel={formatProviderModelLabel(provider, model)}
      refineDisabledReason={t('pipeline.reasonMissingKey', { provider })}
      extraActions={<>{commands}{lockButton}<CommandRule /></>}
    />
  );
}
