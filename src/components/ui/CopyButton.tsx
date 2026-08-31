import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, type IconButtonSize } from './IconButton';

interface CopyButtonProps {
  text: string;
  size?: IconButtonSize;
}

export function CopyButton({ text, size = 'md' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(t('pipeline.copyFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const label = copied ? t('pipeline.copied') : t('pipeline.copy');

  return (
    <IconButton size={size} onClick={() => void handleCopy()} disabled={!text} title={label}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </IconButton>
  );
}
