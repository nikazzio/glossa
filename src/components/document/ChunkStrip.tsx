import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationChunk } from '../../types';
import { indexPad } from '../../utils';
import { IconButton } from '../ui';
import { ChunkDot } from './ChunkDot';

/** Pallini visibili insieme; il frammento aperto sta in quello centrale. */
const WINDOW_SIZE = 7;
const WINDOW_HALF = Math.floor(WINDOW_SIZE / 2);
/** Larghezza di un posto nella fila, in pixel: pallino più respiro. */
const SLOT_PX = 40;
/** Rotella accumulata prima di passare al frammento vicino: un tocco di
 *  rotella è un frammento, non dieci. */
const WHEEL_STEP = 60;
/** Le due estremità sfumano: si capisce che la fila continua oltre. */
const WINDOW_FADE = 'linear-gradient(to right, transparent, black 14%, black 86%, transparent)';

interface ChunkStripProps {
  chunks: TranslationChunk[];
  currentIndex: number;
  onSelect: (chunkId: string) => void;
}

function clampIndex(index: number, total: number): number {
  return Math.min(Math.max(index, 0), total - 1);
}

/**
 * La fila sopra i due fogli. A sinistra il numero del frammento; al centro una
 * finestra di sette pallini con il frammento aperto fermo sotto il segno
 * centrale, e gli altri che scorrono ai lati. Frecce singole per il frammento
 * vicino, doppie per saltare di una finestra intera; anche la rotella sopra la
 * finestra scorre i frammenti.
 */
export function ChunkStrip({ chunks, currentIndex, onSelect }: ChunkStripProps) {
  const { t } = useTranslation();
  const windowRef = useRef<HTMLDivElement | null>(null);
  const total = chunks.length;

  // La rotella deve poter bloccare lo scorrimento della pagina, e React
  // registra i suoi ascoltatori come passivi: serve quello nativo.
  const latest = useRef({ chunks, currentIndex, onSelect });
  useEffect(() => {
    latest.current = { chunks, currentIndex, onSelect };
  });
  const hasWindow = total > 1;
  useEffect(() => {
    const element = windowRef.current;
    if (!element) return;
    let accumulated = 0;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      accumulated += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(accumulated) < WHEEL_STEP) return;
      const step = accumulated > 0 ? 1 : -1;
      accumulated = 0;
      const { chunks: current, currentIndex: index, onSelect: select } = latest.current;
      const next = clampIndex(index + step, current.length);
      if (next !== index) select(current[next].id);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [hasWindow]);

  if (total === 0) return null;

  const goTo = (index: number) => {
    const next = clampIndex(index, total);
    if (next !== currentIndex) onSelect(chunks[next].id);
  };
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= total - 1;
  const trackOffset = (WINDOW_HALF - currentIndex) * SLOT_PX;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <span className="flex shrink-0 flex-col gap-1">
        <span className="caption-label leading-none">{t('document.chunkLabel')}</span>
        <span className="font-display text-lg italic leading-none text-editorial-ink tabular-nums">
          {indexPad(currentIndex + 1)}<span className="px-0.5 text-sm text-editorial-muted">/ {indexPad(total)}</span>
        </span>
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="flex shrink-0 items-center gap-1">
          <IconButton size="sm" onClick={() => goTo(currentIndex - WINDOW_SIZE)} disabled={isFirst} title={t('document.jumpBackChunks', { count: WINDOW_SIZE })} tooltipSide="bottom">
            <ChevronsLeft size={14} />
          </IconButton>
          <IconButton size="sm" onClick={() => goTo(currentIndex - 1)} disabled={isFirst} title={t('document.previousChunk')} tooltipSide="bottom">
            <ChevronLeft size={14} />
          </IconButton>
        </span>
        {total > 1 && (
          <div
            ref={windowRef}
            className="relative h-11 shrink-0 overflow-hidden"
            style={{ width: WINDOW_SIZE * SLOT_PX, maskImage: WINDOW_FADE, WebkitMaskImage: WINDOW_FADE }}
          >
            {/* Il segno fisso: la punta d'accento sotto il posto centrale, la
                stessa che segnava il frammento aperto nella fila di prima. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 h-0 w-0 -translate-x-1/2 border-x-[3.5px] border-b-[4.5px] border-x-transparent border-b-editorial-accent"
              style={{ left: WINDOW_HALF * SLOT_PX + SLOT_PX / 2 }}
            />
            <div
              className="absolute inset-y-0 left-0 flex items-start pt-1 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
              style={{ transform: `translateX(${trackOffset}px)` }}
            >
              {chunks.map((chunk, index) => (
                <span key={chunk.id} className="flex shrink-0 justify-center" style={{ width: SLOT_PX }}>
                  <ChunkDot
                    chunk={chunk}
                    index={index}
                    total={total}
                    isCurrent={index === currentIndex}
                    hidden={Math.abs(index - currentIndex) > WINDOW_HALF}
                    onSelect={onSelect}
                  />
                </span>
              ))}
            </div>
          </div>
        )}
        <span className="flex shrink-0 items-center gap-1">
          <IconButton size="sm" onClick={() => goTo(currentIndex + 1)} disabled={isLast} title={t('document.nextChunk')} tooltipSide="bottom">
            <ChevronRight size={14} />
          </IconButton>
          <IconButton size="sm" onClick={() => goTo(currentIndex + WINDOW_SIZE)} disabled={isLast} title={t('document.jumpForwardChunks', { count: WINDOW_SIZE })} tooltipSide="bottom">
            <ChevronsRight size={14} />
          </IconButton>
        </span>
      </div>
    </div>
  );
}
