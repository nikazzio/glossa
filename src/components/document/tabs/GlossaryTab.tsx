import { Highlighter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { IconButton } from '../../ui';

export interface GlossaryTabProps {
  panelId: string;
  labelledBy: string;
  glossary: Array<{ id?: string; term: string; translation: string; notes?: string }>;
}

export function GlossaryTab({ panelId, labelledBy, glossary }: GlossaryTabProps) {
  const { t } = useTranslation();
  const highlightsEnabled = useUiStore((state) => state.highlightsEnabled);
  const setHighlightsEnabled = useUiStore((state) => state.setHighlightsEnabled);
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="flex flex-1 flex-col"
    >
      <div className="flex items-center justify-between gap-3 border-b border-editorial-border px-5 py-3">
        <span className="text-xs font-mono text-editorial-muted">{glossary.length} {t('document.insightsTabGlossary').toLowerCase()}</span>
        <IconButton
          size="sm"
          tone={highlightsEnabled ? 'accent' : 'default'}
          onClick={() => setHighlightsEnabled(!highlightsEnabled)}
          title={t('library.glossaryHighlightToggle')}
          ariaPressed={highlightsEnabled}
        >
          <Highlighter size={13} />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-editorial-border px-5 py-2 text-xs text-editorial-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--hl-match-bg)' }}
            aria-hidden="true"
          />
          {t('library.glossaryLegendMatch')}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--hl-mismatch-bg)' }}
            aria-hidden="true"
          />
          {t('library.glossaryLegendMismatch')}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full border-b-2"
            style={{ borderColor: 'var(--hl-source-term-color)' }}
            aria-hidden="true"
          />
          {t('library.glossaryLegendSourceTerm')}
        </span>
      </div>
      <p className="border-b border-editorial-border px-5 py-2 text-xs leading-relaxed text-editorial-muted">
        {t('memory.referencesGlossaryHint')}
      </p>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2">
        <table className="w-full text-sm">
          <tbody>
            {glossary.map((entry, i) => (
              <tr key={entry.id ?? i} className="border-b border-editorial-border/40 last:border-0">
                <td className="py-2 pr-3 font-medium text-editorial-ink">{entry.term}</td>
                <td className="py-2 text-editorial-muted/60">→</td>
                <td className="py-2 pl-3 text-editorial-ink">{entry.translation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
