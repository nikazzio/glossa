import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HardDrive,
  PanelLeftClose,
  PanelLeftOpen,
  ZoomIn,
  ZoomOut,
  Maximize,
  Focus,
  MoreHorizontal,
} from 'lucide-react';
import { ClickPopover, IconButton, IconLink, MenuActionRow, Tooltip } from '../ui';
import type { ImageSource } from '../../services/cacheService';

/**
 * La barra del visore: sfoglio, provenienza di ciò che si guarda, zoom.
 *
 * Sta in un file suo perché la usano due letture diverse — la sequenza di
 * immagini della biblioteca e il documento unico — e le due devono avere gli
 * stessi comandi nello stesso posto. Quello che vale solo per le immagini
 * (miniature, lettura dal solo computer, uscita verso la pagina della
 * biblioteca) è facoltativo: chi non ce l'ha non lo mostra.
 */
export interface ViewerToolbarProps {
  /** Vero quando la pagina viene letta dal computer e non dalla biblioteca. */
  fromDisk: boolean;
  /** Da dove arriva la pagina a schermo, quando il motore l'ha detto. */
  origin: { source: ImageSource | null; size: string } | null;
  /** Il lato lungo in pixel dell'immagine a schermo, quando è noto. */
  shownEdge: number | null;
  index: number;
  total: number;
  label: string | null;
  goToPage: string;
  onGoToPageChange: (value: string) => void;
  onGoToPageSubmit: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onZoomToActualSize: () => void;
  /** Vero quando la lettura è limitata ai file già sul computer. Assente per
   *  una lettura che dal computer arriva sempre, come il documento unico. */
  localOnly?: boolean;
  onToggleLocalOnly?: () => void;
  /** Assenti dove non c'è una colonna di miniature da aprire e chiudere. */
  thumbnailsOpen?: boolean;
  onToggleThumbnails?: () => void;
  shownPageUrl?: string | null;
  /** Comandi di chi ospita il visore (es. cambio fonte immagini/PDF nello
   *  Studio di trascrizione): stessa barra, non una riga a parte. */
  extraControls?: ReactNode;
}

/**
 * Da dove arriva **la pagina che si sta guardando**, e a che misura.
 *
 * Due parole, tre pallini. La scritta risponde alla sola domanda che cambia
 * qualcosa per chi legge — questo file è mio o no — e una pagina presa dalla
 * cache non è sua, perché chiudendo il libro non resta. Il colore dice il
 * dettaglio senza allungare la barra: neutro per il file sul computer, giallo
 * per la cache, verde quando la pagina è appena arrivata dalla biblioteca.
 *
 * Finché la provenienza non è nota si dice quello che si sa: se il libro è sul
 * disco, il disco.
 */
function ConnectionBadge({
  fromDisk,
  origin,
  shownEdge,
}: {
  fromDisk: boolean;
  origin: { source: ImageSource | null; size: string } | null;
  shownEdge: number | null;
}) {
  const { t } = useTranslation();
  const source = origin?.source ?? (fromDisk ? 'vault' : null);
  const fromLibrary = source === 'network';
  const fromCache = source === 'cache';
  const onDisk = source === 'vault';

  const dotClass = fromLibrary
    ? 'bg-editorial-success'
    : fromCache
      // Oro, non l'ocra profonda degli avvisi: su un pallino da sei pixel
      // `warning` legge come un rosso scuro, e questo non è un avviso.
      ? 'bg-editorial-running'
      : 'bg-editorial-border';
  const label = onDisk ? t('areas.library.viewerFromDisk') : t('areas.library.viewerOnline');
  // La misura è quella dei pixel arrivati davvero: da quando una copia locale
  // più grande viene servita com'è, la misura chiesta non è più quella che si
  // sta guardando.
  const size = shownEdge !== null ? String(shownEdge) : (origin?.size ?? null);
  const detail = fromLibrary
    ? t('areas.library.viewerOriginLibrary')
    : fromCache
      ? t('areas.library.viewerOriginCache')
      : onDisk
        ? t('areas.library.viewerOriginVault')
        : label;

  return (
    <Tooltip
      label={size ? `${detail} · ${t('areas.library.viewerOriginSize', { size })}` : detail}
      side="bottom"
    >
      <span
        className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${fromLibrary ? 'text-editorial-success' : 'text-editorial-muted'}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
        {label}
      </span>
    </Tooltip>
  );
}

export function ViewerToolbar({
  fromDisk,
  origin,
  shownEdge,
  index,
  total,
  label,
  goToPage,
  onGoToPageChange,
  onGoToPageSubmit,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onZoomToActualSize,
  localOnly,
  onToggleLocalOnly,
  thumbnailsOpen,
  onToggleThumbnails,
  shownPageUrl,
  extraControls,
}: ViewerToolbarProps) {
  const { t } = useTranslation();
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-editorial-border px-3">
      {onToggleThumbnails && (
        <>
          <IconButton
            size="sm"
            onClick={onToggleThumbnails}
            ariaPressed={thumbnailsOpen}
            title={t(thumbnailsOpen ? 'areas.library.viewerHideThumbnails' : 'areas.library.viewerShowThumbnails')}
          >
            {thumbnailsOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </IconButton>
          <span className="h-5 w-px shrink-0 bg-editorial-border" aria-hidden="true" />
        </>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <IconButton size="sm" onClick={onPrev} disabled={index <= 0} title={t('areas.library.viewerPrevPage')}>
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton size="sm" onClick={onNext} disabled={index >= total - 1} title={t('areas.library.viewerNextPage')}>
          <ChevronRight size={14} />
        </IconButton>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <form
          className="shrink-0"
          onSubmit={(event) => {
            event.preventDefault();
            onGoToPageSubmit();
          }}
        >
          <input
            value={goToPage}
            onChange={(event) => onGoToPageChange(event.target.value.replace(/\D/g, ''))}
            placeholder={String(index + 1)}
            aria-label={t('areas.library.viewerGoToPage')}
            // Non FIELD_CLASSNAME: porta `w-full`, che nella cascata compilata
            // di Tailwind può vincere su `w-12` scritto dopo — un campo per
            // "quale pagina" largo quanto tutta la barra. Stessa spunta
            // visiva, larghezza propria: un libro di diecimila pagine ci
            // sta comunque.
            className="w-14 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1 text-center text-xs text-editorial-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
          />
        </form>
        <span className="truncate text-xs text-editorial-muted">
          {t('areas.library.viewerPageOf', { index: index + 1, total })}
          {label ? ` · ${label}` : ''}
        </span>
      </div>

      {/* La provenienza è uno stato, non un comando: sta in mezzo, fra il
          contesto a sinistra e i comandi a destra. */}
      <div className="mx-auto shrink-0">
        <ConnectionBadge fromDisk={fromDisk} origin={origin} shownEdge={shownEdge} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {extraControls}
        {extraControls && <span className="mx-1 h-5 w-px shrink-0 bg-editorial-border" aria-hidden="true" />}
        {onToggleLocalOnly && (
          <IconButton
            size="sm"
            tone={localOnly ? 'accent' : 'default'}
            ariaPressed={localOnly}
            onClick={onToggleLocalOnly}
            title={t(localOnly ? 'areas.library.viewerLocalOnlyOff' : 'areas.library.viewerLocalOnly')}
          >
            <HardDrive size={14} />
          </IconButton>
        )}
        {/* Due uscite diverse, accanto al comando che salva: questa pagina
            com'è servita dalla biblioteca, e l'opera intera sul loro sito. */}
        {shownPageUrl && (
          <IconLink
            size="sm"
            href={shownPageUrl}
            title={t('areas.library.openShownPage')}
            tooltipSide="bottom"
          >
            <ExternalLink size={14} />
          </IconLink>
        )}
        <span className="mx-1 h-5 w-px shrink-0 bg-editorial-border" aria-hidden="true" />
        <IconButton size="sm" onClick={onZoomOut} title={t('areas.library.viewerZoomOut')}>
          <ZoomOut size={14} />
        </IconButton>
        <IconButton size="sm" onClick={onZoomIn} title={t('areas.library.viewerZoomIn')}>
          <ZoomIn size={14} />
        </IconButton>
        <ClickPopover
          open={zoomMenuOpen}
          onOpenChange={setZoomMenuOpen}
          trigger={
            <IconButton
              size="sm"
              ariaPressed={zoomMenuOpen}
              title={t('areas.library.viewerZoomMore')}
            >
              <MoreHorizontal size={14} />
            </IconButton>
          }
        >
          <div className="min-w-44 py-1">
            <MenuActionRow
              icon={<Maximize size={14} />}
              label={t('areas.library.viewerZoomToFit')}
              onClick={() => {
                setZoomMenuOpen(false);
                onZoomToFit();
              }}
            />
            <MenuActionRow
              icon={<Focus size={14} />}
              label={t('areas.library.viewerZoomActualSize')}
              onClick={() => {
                setZoomMenuOpen(false);
                onZoomToActualSize();
              }}
            />
          </div>
        </ClickPopover>
      </div>
    </div>
  );
}


