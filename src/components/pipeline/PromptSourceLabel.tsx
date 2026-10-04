import { useTranslation } from 'react-i18next';
import type { PromptSource } from './promptSource';

/** La provenienza del testo accanto al titolo di un prompt: template, predefinito o personalizzato. */
export function PromptSourceLabel({ source }: { source: PromptSource }) {
  const { t } = useTranslation();
  if (source.kind === 'empty') return null;
  const text = source.kind === 'template'
    ? t('pipeline.promptSource.template', { name: source.name })
    : t(`pipeline.promptSource.${source.kind}`);
  return <span className="min-w-0 truncate text-xs text-editorial-muted" title={text}>{text}</span>;
}
