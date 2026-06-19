import { NotebookPen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface AnnotationContextMenuProps {
  x: number;
  y: number;
  onAddAnnotation: () => void;
  onClose: () => void;
}

export function AnnotationContextMenu({ x, y, onAddAnnotation, onClose }: AnnotationContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: y, left: x }}
      className="z-50 min-w-[200px] rounded-2xl border border-editorial-border bg-editorial-page py-1.5 shadow-[var(--shadow-warm-md)]"
    >
      <button
        type="button"
        onClick={() => { onAddAnnotation(); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-editorial-ink transition-colors hover:bg-editorial-textbox/60 hover:text-editorial-accent"
      >
        <NotebookPen size={13} className="shrink-0 text-editorial-accent" />
        {t('annotations.contextMenuAdd')}
      </button>
    </div>
  );
}
