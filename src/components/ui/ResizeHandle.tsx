import type { ReactNode } from 'react';
import { Separator } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';

/**
 * Il divisore trascinabile fra due colonne: grip sempre visibile, verde al
 * passaggio, al trascinamento e al fuoco. `layer` lo alza sopra la shell quando
 * divide colonne dell'applicazione; `cap` è un elemento di chi lo usa che deve
 * coprire la sua parte alta (la testata della shell).
 */
export function ResizeHandle({ dragging, onDragStart, layer = 'panel', cap }: {
  dragging: boolean;
  onDragStart: () => void;
  layer?: 'panel' | 'shell';
  cap?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Separator
      onPointerDown={onDragStart}
      aria-label={t('common.resizeColumns')}
      className={`group/sep relative ${layer === 'shell' ? 'z-30' : 'z-10'} flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
        dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
      }`}
    >
      {cap}
      <span
        aria-hidden="true"
        className={`relative h-7 w-px rounded-full transition-colors ${
          dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
        }`}
      />
    </Separator>
  );
}
