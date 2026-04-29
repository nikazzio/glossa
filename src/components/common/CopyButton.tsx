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
      aria-label={label}
      aria-live="polite"
      className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
