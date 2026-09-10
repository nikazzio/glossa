import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewerPage } from '../../services/iiifViewerService';
import { pageThumbnailUrl } from '../../services/iiifViewerService';
import { THUMB_SIZE, type CacheRequest } from '../../services/cacheService';
import { useCachedImage } from '../../hooks/useCachedImage';
import { Tooltip } from '../ui';

const THUMB_WIDTH_PX = 96;
const ROW_HEIGHT_PX = 96;
const OVERSCAN_ROWS = 4;

interface ThumbnailRailProps {
  pages: ViewerPage[];
  /** L'opera a cui appartengono: serve a cercarne le pagine sul computer. */
  versionId: string;
  providerKey: string | null;
  currentIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Il rail delle miniature: solo le righe vicine allo scorrimento vengono
 * disegnate e chiedono la loro immagine. Un libro di poche centinaia di
 * pagine reggerebbe anche senza, ma uno di migliaia (previsto dal piano)
 * costruirebbe altrettanti elementi DOM e altrettante richieste in un colpo
 * solo — la finestra qui sotto evita entrambe le cose.
 */
export function ThumbnailRail({
  pages,
  versionId,
  providerKey,
  currentIndex,
  onSelect,
}: ThumbnailRailProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS);
  const visibleRows = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2;
  const lastVisible = Math.min(pages.length, firstVisible + visibleRows);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setViewportHeight(container.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rowTop = currentIndex * ROW_HEIGHT_PX;
    const rowBottom = rowTop + ROW_HEIGHT_PX;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;
    if (rowTop < viewportTop) {
      container.scrollTop = rowTop;
      setScrollTop(rowTop);
    } else if (rowBottom > viewportBottom) {
      const nextScrollTop = Math.max(0, rowBottom - container.clientHeight);
      container.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [currentIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let target: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = currentIndex + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target = currentIndex - 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = pages.length - 1;
    if (target === null || target < 0 || target >= pages.length) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(target);
  };

  return (
    <div
      role="listbox"
      aria-label={t('areas.library.viewerThumbnails')}
      tabIndex={0}
      className="h-full min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      onKeyDown={handleKeyDown}
      ref={containerRef}
    >
      <div style={{ height: pages.length * ROW_HEIGHT_PX, position: 'relative' }}>
        {pages.slice(firstVisible, lastVisible).map((page, offset) => {
          const index = firstVisible + offset;
          return (
            <ThumbnailRow
              key={page.canvasId ?? page.index}
              page={page}
              position={index + 1}
              versionId={versionId}
              providerKey={providerKey}
              active={index === currentIndex}
              top={index * ROW_HEIGHT_PX}
              onSelect={() => onSelect(index)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ThumbnailRow({
  page,
  position,
  versionId,
  providerKey,
  active,
  top,
  onSelect,
}: {
  page: ViewerPage;
  position: number;
  versionId: string;
  providerKey: string | null;
  active: boolean;
  top: number;
  onSelect: () => void;
}) {
  const request: CacheRequest = {
    kind: 'page',
    versionId,
    index: page.index,
    size: THUMB_SIZE,
    remoteUrl: pageThumbnailUrl(page, THUMB_WIDTH_PX),
    providerKey,
  };
  const { url, loading } = useCachedImage(request, { priority: 'low' });

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      style={{ top, height: ROW_HEIGHT_PX }}
      className={`absolute inset-x-0 flex flex-col items-center justify-center gap-1 border-b border-editorial-border/50 px-2 py-1 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-editorial-accent ${
        active ? 'bg-editorial-accent/15 text-editorial-accent' : 'text-editorial-muted hover:bg-surface-hover'
      }`}
    >
      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-sm border border-editorial-border/60 bg-surface-elevated">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : loading ? (
          <span className="h-3 w-3 animate-pulse rounded-full bg-editorial-muted/40" aria-hidden="true" />
        ) : null}
      </span>
      <Tooltip label={page.label ? `${position} · ${page.label}` : String(position)} side="right">
        <span className="truncate">{position}</span>
      </Tooltip>
    </button>
  );
}
