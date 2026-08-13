import { Columns2, Highlighter, Link2, Link2Off, PanelLeft, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { IconButton, Tooltip } from '../ui';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';

/**
 * Comandi di vista del documento: quali colonne mostrare, scorrimento
 * sincronizzato, evidenziazioni del glossario.
 *
 * Stanno **sopra il testo**, non nella barra di stato: agiscono su ciò che
 * hanno sotto, e nella barra facevano comparire e sparire cinque comandi a
 * ogni cambio di sezione — la barra di stato deve avere la stessa forma
 * ovunque.
 */
export function DocumentViewControls() {
  const { t } = useTranslation();
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
    <div className="flex shrink-0 items-center gap-1">
      <IconButton
        size="md"
        tone={documentPaneFocus === 'both' ? 'accent' : 'default'}
        onClick={() => setDocumentPaneFocus('both')}
        title={t('document.focusBoth')}
        ariaPressed={documentPaneFocus === 'both'}
      >
        <Columns2 size={13} />
      </IconButton>
      <IconButton
        size="md"
        tone={documentPaneFocus === 'source' ? 'accent' : 'default'}
        onClick={() => setDocumentPaneFocus('source')}
        title={t('document.focusSource')}
        ariaPressed={documentPaneFocus === 'source'}
      >
        <PanelLeft size={13} />
      </IconButton>
      <IconButton
        size="md"
        tone={documentPaneFocus === 'translation' ? 'accent' : 'default'}
        onClick={() => setDocumentPaneFocus('translation')}
        title={t('document.focusTranslation')}
        ariaPressed={documentPaneFocus === 'translation'}
      >
        <PanelRight size={13} />
      </IconButton>
      <span className="mx-0.5 h-4 w-px bg-editorial-border/60" aria-hidden="true" />
      <IconButton
        size="md"
        tone={syncOn ? 'accent' : 'default'}
        onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
        disabled={syncDisabled}
        title={syncOn ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')}
        ariaPressed={syncOn}
      >
        {syncOn ? <Link2 size={13} /> : <Link2Off size={13} />}
      </IconButton>
      {hasGlossary && (
        <IconButton
          size="md"
          tone={highlightsEnabled ? 'accent' : 'default'}
          onClick={() => setHighlightsEnabled(!highlightsEnabled)}
          title={t('library.glossaryHighlightToggle')}
          ariaPressed={highlightsEnabled}
        >
          <Highlighter size={13} />
        </IconButton>
      )}
    </div>
  );
}

/**
 * Un numero del frammento: icona, valore, e l'etichetta al passaggio del mouse.
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
    <Tooltip label={label} side="bottom">
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
