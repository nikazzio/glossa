import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-editorial-muted hover:text-editorial-ink transition-colors flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      aria-label={copied ? t('pipeline.copied') : t('pipeline.copy')}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span aria-live="polite">{copied ? t('pipeline.copied') : t('pipeline.copy')}</span>
    </button>
  );
}
