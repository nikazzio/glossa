import { NotebookText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TranslationChunk } from '../../../types';

export interface NotesTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

export function NotesTab({ panelId, labelledBy, currentChunk }: NotesTabProps) {
  const { t } = useTranslation();
  const footnotes = currentChunk?.footnotes ?? [];

  if (!currentChunk || footnotes.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <NotebookText size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('document.insightsNotesEmpty')}</p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="space-y-2 px-5 py-5">
      {footnotes.map((note) => (
        <article key={note.id} className="rounded-2xl border border-editorial-border bg-editorial-bg px-4 py-3">
          <div className="mb-1.5 font-display text-sm italic text-editorial-accent">{note.marker}</div>
          <p className="text-[12px] leading-relaxed text-editorial-ink">{note.text}</p>
        </article>
      ))}
    </div>
  );
}
