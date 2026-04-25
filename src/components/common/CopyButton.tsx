import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(t('pipeline.copyFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const isDisabled = !text;
  const label = copied ? t('pipeline.copied') : t('pipeline.copy');

  return (
    <button
      onClick={handleCopy}
      disabled={isDisabled}
      title={label}
      className="text-editorial-muted hover:text-editorial-ink transition-colors flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={label}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span aria-live="polite">{label}</span>
    </button>
  );
}
