import { Columns2, Highlighter, LayoutGrid, Link2, Link2Off, PanelLeft, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, type ReactNode } from 'react';
import { ClickPopover, IconButton, SettingRow } from '../ui';
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
    <SettingRow label={label}>
      <IconButton onClick={onClick} disabled={disabled} ariaPressed={active} title={label}>{icon}</IconButton>
    </SettingRow>
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
          tone="default"
          title={t('document.viewOptions')}
          ariaLabel={t('document.viewOptions')}
          ariaPressed={open}
          tooltipSide="bottom"
        >
          <LayoutGrid size={12} />
        </IconButton>
      }
    >
      <div className="px-3">
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
      <div className="border-t border-rule" />
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
      </div>
    </ClickPopover>
  );
}
