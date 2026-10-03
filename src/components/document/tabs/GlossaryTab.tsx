import { BookText, Highlighter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { IconButton, PanelSection } from '../../ui';

export interface GlossaryTabProps {
  panelId: string;
  labelledBy: string;
  glossary: Array<{ id?: string; term: string; translation: string; notes?: string }>;
}

/** I tre segni dell'evidenziazione nei fogli, con i colori del foglio di stile. */
const LEGEND = [
  { key: 'library.glossaryLegendMatch', swatchClassName: 'rounded-full', style: { background: 'var(--hl-match-bg)' } },
  { key: 'library.glossaryLegendMismatch', swatchClassName: 'rounded-full', style: { background: 'var(--hl-mismatch-bg)' } },
  { key: 'library.glossaryLegendSourceTerm', swatchClassName: 'rounded-full border-b-2', style: { borderColor: 'var(--hl-source-term-color)' } },
] as const;

/**
 * Il glossario assegnato, da consultare durante il controllo: un titoletto con
 * il numero dei termini (la spiegazione sta nel suo suggerimento), il comando
 * che evidenzia i termini nei fogli e, solo a evidenziazione accesa, la legenda
 * dei colori. Sotto, i termini in righe piatte.
 */
export function GlossaryTab({ panelId, labelledBy, glossary }: GlossaryTabProps) {
  const { t } = useTranslation();
  const highlightsEnabled = useUiStore((state) => state.highlightsEnabled);
  const setHighlightsEnabled = useUiStore((state) => state.setHighlightsEnabled);

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-5 pb-3">
        <PanelSection
          icon={BookText}
          label={`${t('document.insightsTabGlossary')} · ${t('document.glossaryTermCount', { count: glossary.length })}`}
          hint={t('memory.referencesGlossaryHint')}
          actions={
            <IconButton
              size="sm"
              tone={highlightsEnabled ? 'accent' : 'default'}
              onClick={() => setHighlightsEnabled(!highlightsEnabled)}
              title={t('library.glossaryHighlightToggle')}
              ariaPressed={highlightsEnabled}
            >
              <Highlighter size={13} />
            </IconButton>
          }
        >
          {highlightsEnabled && (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-editorial-muted">
              {LEGEND.map(({ key, swatchClassName, style }) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 ${swatchClassName}`} style={style} aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
          )}
        </PanelSection>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto px-4 pb-4 custom-scrollbar">
        {glossary.map((entry, i) => (
          <li key={entry.id ?? i} className="grid grid-cols-2 gap-3 py-2 text-sm">
            <span className="min-w-0 break-words font-medium text-editorial-ink">{entry.term}</span>
            <span className="min-w-0 break-words text-editorial-ink">{entry.translation}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
