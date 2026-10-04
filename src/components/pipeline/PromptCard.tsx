import { Check, Clipboard, Eye, Minimize2 } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Hint, IconButton } from '../ui';

export function PromptCard({ label, hint, meta, actions, children }: {
  label: string;
  hint?: string;
  /** Riga breve accanto al titolo, per esempio da dove viene il testo. */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return <article className="linguistic-resource space-y-3 rounded-md border-l-2 border-editorial-accent bg-surface-resource p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* La spiegazione la porta il titolo stesso, come in SectionLabel: niente «i» a parte. */}
        <h3 className="break-words font-display text-lg italic text-editorial-ink">
          {hint ? <Hint label={`${label} — ${hint}`}>{label}</Hint> : label}
        </h3>
        {meta}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
    {children}
  </article>;
}

export function PromptMessage({ label, hint, text, metadata }: {
  label: string;
  hint?: string;
  text: string;
  metadata?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('promptPreview.copiedToClipboard'));
    } catch {
      toast.error(t('errors.clipboardFailed'));
    }
  };
  return <PromptCard label={label} hint={hint} actions={<>
    {metadata}
    <IconButton size="sm" title={t(expanded ? 'library.collapsePrompt' : 'library.expandPrompt')}
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
      {expanded ? <Minimize2 size={14} /> : <Eye size={14} />}
    </IconButton>
    <IconButton size="sm" title={t('promptPreview.copyBlock')} onClick={() => void copy()}>
      {copied ? <Check size={14} /> : <Clipboard size={14} />}
    </IconButton>
  </>}>
    <pre id={id} className={`whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-editorial-ink ${expanded ? '' : 'line-clamp-5'}`}>{text}</pre>
  </PromptCard>;
}
