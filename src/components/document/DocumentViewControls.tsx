import { Columns2, Highlighter, LayoutGrid, Link2, Link2Off, PanelLeft, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, type ReactNode } from 'react';
import { ClickPopover, IconButton, Tooltip } from '../ui';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';

interface ViewOptionRowProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function ViewOptionRow({ active, disabled, onClick, icon, label }: ViewOptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'font-medium text-editorial-accent' : 'text-editorial-ink hover:bg-editorial-textbox/60'
      }`}
    >
      <span className={active ? 'text-editorial-accent' : 'text-editorial-muted'}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Menu unico "opzioni vista": quali colonne mostrare, scorrimento
 * sincronizzato, evidenziazioni del glossario.
 *
 * Accorpati in un solo pulsante trigger di larghezza fissa (nessun contenuto
 * condizionale nel trigger): prima queste cinque azioni stavano come icone
 * separate nella barra di stato e facevano comparire/scomparire comandi a ogni
 * cambio di sezione, cambiando la forma della barra — un bug di layout-jump
 * già corretto una volta. Il trigger unico non lo reintroduce.
 */
export function DocumentViewOptionsMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const documentPaneFocus = useUiStore((state) => state.documentPaneFocus);
  const setDocumentPaneFocus = useUiStore((state) => state.setDocumentPaneFocus);
  const syncScrollEnabled = useUiStore((state) => state.syncScrollEnabled);
  const setSyncScrollEnabled = useUiStore((state) => state.setSyncScrollEnabled);
  const highlightsEnabled = useUiStore((state) => state.highlightsEnabled);
  const setHighlightsEnabled = useUiStore((state) => state.setHighlightsEnabled);
  const hasGlossary = usePipelineStore((state) => state.config.glossary.length > 0);

  // Sincronizzare lo scorrimento ha senso solo con due colonne aperte.
  const syncDisabled = documentPaneFocus !== 'both';
  const syncOn = syncScrollEnabled && !syncDisabled;

  return (
    <ClickPopover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      trigger={
        <IconButton
          size="sm"
          tone={open ? 'accent' : 'default'}
          title={t('document.viewOptions')}
          ariaLabel={t('document.viewOptions')}
          ariaPressed={open}
          tooltipSide="bottom"
        >
          <LayoutGrid size={12} />
        </IconButton>
      }
    >
      <ViewOptionRow
        active={documentPaneFocus === 'both'}
        onClick={() => setDocumentPaneFocus('both')}
        icon={<Columns2 size={13} />}
        label={t('document.focusBoth')}
      />
      <ViewOptionRow
        active={documentPaneFocus === 'source'}
        onClick={() => setDocumentPaneFocus('source')}
        icon={<PanelLeft size={13} />}
        label={t('document.focusSource')}
      />
      <ViewOptionRow
        active={documentPaneFocus === 'translation'}
        onClick={() => setDocumentPaneFocus('translation')}
        icon={<PanelRight size={13} />}
        label={t('document.focusTranslation')}
      />
      <div className="border-t border-editorial-border/60" />
      <ViewOptionRow
        active={syncOn}
        disabled={syncDisabled}
        onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
        icon={syncOn ? <Link2 size={13} /> : <Link2Off size={13} />}
        label={syncOn ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')}
      />
      {hasGlossary && (
        <ViewOptionRow
          active={highlightsEnabled}
          onClick={() => setHighlightsEnabled(!highlightsEnabled)}
          icon={<Highlighter size={13} />}
          label={t('library.glossaryHighlightToggle')}
        />
      )}
    </ClickPopover>
  );
}

/**
 * Un numero del frammento: icona, valore, e l'etichetta al passaggio del mouse.
 *
 * L'etichetta esce **verso l'alto**: i comandi di vista stanno nella riga
 * sotto e mandano le loro verso il basso, così le due file non si coprono a
 * vicenda.
 *
 * Le tre voci — unità, token, costo — stavano in colonne con l'etichetta scritta
 * sopra: occupavano mezza barra per dire tre numeri. Qui l'etichetta arriva
 * quando serve, come per il resto dei comandi dell'app.
 */
export function ChunkMetric({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <Tooltip label={label} side="top">
      <span className="flex cursor-default items-center gap-1.5">
        <span className="text-editorial-muted">{icon}</span>
        <span
          className={`font-display text-base italic tabular-nums ${
            tone === 'accent' ? 'text-editorial-accent' : 'text-editorial-ink'
          }`}
        >
          {value}
        </span>
      </span>
    </Tooltip>
  );
}
