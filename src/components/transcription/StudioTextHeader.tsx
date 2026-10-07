import { ChevronLeft, ChevronRight, CircleCheck, Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';
import type { SaveState } from './useSegmentEditor';

const DIVIDER_CLASSNAME = 'h-4 w-px shrink-0 bg-editorial-border';

interface StudioTextHeaderProps {
  title: string;
  /** In sincronia il visore comanda la pagina e le frecce del testo non servono. */
  synced: boolean;
  pageIndex: number;
  pageTotal: number | null;
  onTextPageChange: (nextIndex: number) => void;
  verified: boolean;
  verifying: boolean;
  /** Perché verifica e riporto in bozza non si possono usare adesso; `null` se si può. */
  verifyBlockedReason: string | null;
  onToggleVerified: () => void;
  /** Etichetta della prima pagina del documento in lettura, se ce n'è una. */
  readingPageLabel: string | null;
  saveState: SaveState;
  canSave: boolean;
  /** Perché il salvataggio non si può usare adesso; `null` se non c'è niente da salvare. */
  saveBlockedReason: string | null;
  onSave: () => void;
  textMenuOpen: boolean;
  onTextMenuToggle: () => void;
}

/**
 * La barra sopra il foglio: stessa altezza della barra del visore a sinistra
 * (h-12), così le due colonne partono allineate. Lo stato del salvataggio sta
 * nella barra di stato, come per le traduzioni; qui resta il dischetto, rosso
 * se il salvataggio è fallito.
 */
export function StudioTextHeader({
  title,
  synced,
  pageIndex,
  pageTotal,
  onTextPageChange,
  verified,
  verifying,
  verifyBlockedReason,
  onToggleVerified,
  readingPageLabel,
  saveState,
  canSave,
  saveBlockedReason,
  onSave,
  textMenuOpen,
  onTextMenuToggle,
}: StudioTextHeaderProps) {
  const { t } = useTranslation();
  const verifyLabel = t(verified ? 'transcription.unverify' : 'transcription.verify');
  const saveLabel = saveState === 'error' && canSave
    ? t('transcription.saveRetry')
    : canSave
      ? t('transcription.saveNow')
      : saveBlockedReason
        ? t('transcription.commandBlocked', { command: t('transcription.saveNow'), reason: saveBlockedReason })
        : t('transcription.saveNowNothing');

  return (
    <div className="@container shrink-0 border-b border-editorial-border">
      <div className="flex h-12 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Navigazione autonoma del testo, solo fuori sincronia (visore
              staccato sulla secondaria, o sgancio manuale): stesse pagine di
              sempre — cambia solo chi le comanda. */}
          {!synced && (
            <span className="flex shrink-0 items-center gap-0.5">
              <IconButton
                size="sm"
                disabled={pageIndex <= 0}
                onClick={() => onTextPageChange(Math.max(0, pageIndex - 1))}
                title={t('transcription.textPrevPage')}
              >
                <ChevronLeft size={14} />
              </IconButton>
              <IconButton
                size="sm"
                disabled={pageTotal !== null && pageIndex >= pageTotal - 1}
                onClick={() => onTextPageChange(pageTotal !== null ? Math.min(pageTotal - 1, pageIndex + 1) : pageIndex + 1)}
                title={t('transcription.textNextPage')}
              >
                <ChevronRight size={14} />
              </IconButton>
            </span>
          )}
          <h2 className="min-w-0 flex-1 truncate font-display text-lg italic text-editorial-ink">{title}</h2>
          <span className="shrink-0">
            <IconButton
              size="sm"
              tone={verified ? 'success' : 'default'}
              onClick={onToggleVerified}
              disabled={verifying || verifyBlockedReason !== null}
              title={verifyBlockedReason && !verifying
                ? t('transcription.commandBlocked', { command: verifyLabel, reason: verifyBlockedReason })
                : verifyLabel}
              ariaPressed={verified}
            >
              {verifying ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
            </IconButton>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {readingPageLabel && (
            <span className="flex items-center gap-1.5 text-xs text-editorial-running" role="status">
              <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden="true" />
              <span className="inline-block first-letter:uppercase @max-md:sr-only">
                {t('transcription.assist.readingPage', { page: readingPageLabel })}
              </span>
            </span>
          )}
          <IconButton
            size="sm"
            tone={saveState === 'error' ? 'danger' : 'default'}
            onClick={onSave}
            disabled={!canSave}
            title={saveLabel}
          >
            <Save size={14} />
          </IconButton>
          <span className={DIVIDER_CLASSNAME} aria-hidden="true" />
          <IconButton
            size="sm"
            tone={textMenuOpen ? 'accent' : 'default'}
            onClick={onTextMenuToggle}
            title={t('editor.textMenu')}
            ariaPressed={textMenuOpen}
          >
            <SlidersHorizontal size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
