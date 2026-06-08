import { useTranslation } from 'react-i18next';

export interface GlossaryTabProps {
  panelId: string;
  labelledBy: string;
  glossary: Array<{ id?: string; term: string; translation: string; notes?: string }>;
}

export function GlossaryTab({ panelId, labelledBy, glossary }: GlossaryTabProps) {
  const { t } = useTranslation();
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="flex flex-1 flex-col"
    >
      <div className="border-b border-editorial-border px-5 py-3">
        <span className="text-xs font-mono text-editorial-muted">{glossary.length} {t('document.insightsTabGlossary').toLowerCase()}</span>
      </div>
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
