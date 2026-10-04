import { BookMarked, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Hint } from '../ui';
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

/** La stessa provenienza in forma di icona, con il testo nel suggerimento: per le righe fitte dell'anteprima. */
export function PromptSourceIcon({ source }: { source: PromptSource }) {
  const { t } = useTranslation();
  if (source.kind === 'empty' || source.kind === 'default') return null;
  const label = source.kind === 'template'
    ? t('pipeline.promptSource.template', { name: source.name })
    : t('pipeline.promptSource.custom');
  const Icon = source.kind === 'template' ? BookMarked : PenLine;
  return <Hint label={label}><Icon size={13} className="text-editorial-muted" aria-hidden="true" /></Hint>;
}

/** Filetto verticale fra gruppi di comandi in una riga, come nel resto dell'app. */
export function CommandRule() {
  return <span className="mx-1 h-4 w-px bg-editorial-border" aria-hidden="true" />;
}
