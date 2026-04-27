import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry } from '../../types';
import { generateId } from '../../utils';

interface Props {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
  readOnly?: boolean;
}

export function DictionaryEntryEditor({ entries, onChange, readOnly = false }: Props) {
  const { t } = useTranslation();

  const duplicateTermIds = useMemo(() => {
    const termCounts = new Map<string, string[]>();
    for (const e of entries) {
      if (!e.term.trim() || !e.id) continue;
      const key = e.term.trim().toLowerCase();
      termCounts.set(key, [...(termCounts.get(key) ?? []), e.id]);
    }
    const dupes = new Set<string>();
    for (const ids of termCounts.values()) {
      if (ids.length > 1) ids.forEach((id) => dupes.add(id));
    }
    return dupes;
  }, [entries]);

  const addEntry = () => {
    onChange([...entries, { id: generateId('gle'), term: '', translation: '' }]);
  };

  const updateEntry = (id: string, updates: Partial<GlossaryEntry>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-bold uppercase tracking-widest text-editorial-muted">
          {t('pipeline.keywordRegistry')}
          {entries.length > 0 && (
            <span className="ml-2 text-editorial-muted/70 normal-case font-mono tracking-normal">
              ({entries.length})
            </span>
          )}
        </label>
        {!readOnly && (
          <button
            onClick={addEntry}
            title={t('pipeline.addGlossaryEntry')}
            className="text-editorial-accent hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('pipeline.addGlossaryEntry')}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-[11px] text-editorial-muted/60 text-center py-4 border border-dashed border-editorial-border/60 rounded-lg">
          {t('pipeline.glossaryEmpty')}
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((g, i) => {
            const rowKey = g.id ?? `gle-fallback-${i}`;
            const isDuplicate = g.id ? duplicateTermIds.has(g.id) : false;
            const removeLabel = `${t('pipeline.removeGlossaryEntry')} ${i + 1}`;
            return (
              <div
                key={rowKey}
                className={`rounded-lg border p-2 space-y-1.5 ${
                  isDuplicate
                    ? 'border-editorial-warning/60 bg-editorial-textbox/20'
                    : 'border-editorial-border/40 bg-editorial-textbox/20'
                }`}
              >
                <div className="flex gap-2 items-center">
                  <input
                    value={g.term}
                    onChange={(e) => g.id && updateEntry(g.id, { term: e.target.value })}
                    readOnly={readOnly}
                    className="w-full bg-transparent rounded py-2 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 focus:border-editorial-accent/60 read-only:opacity-70"
                    placeholder={t('pipeline.source')}
                    aria-label={`${t('pipeline.source')} ${i + 1}`}
                  />
                  <input
                    value={g.translation}
                    onChange={(e) => g.id && updateEntry(g.id, { translation: e.target.value })}
                    readOnly={readOnly}
                    className="w-full bg-transparent rounded py-2 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 focus:border-editorial-accent/60 read-only:opacity-70"
                    placeholder={t('pipeline.target')}
                    aria-label={`${t('pipeline.target')} ${i + 1}`}
                  />
                  {!readOnly && (
                    <button
                      onClick={() => g.id && removeEntry(g.id)}
                      title={removeLabel}
                      className="ml-auto text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent shrink-0 p-1"
                      aria-label={removeLabel}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <input
                  value={g.notes ?? ''}
                  onChange={(e) => g.id && updateEntry(g.id, { notes: e.target.value })}
                  readOnly={readOnly}
                  className="w-full bg-transparent rounded py-1.5 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/30 focus:border-editorial-accent/60 text-editorial-muted placeholder:text-editorial-muted/40 read-only:opacity-70"
                  placeholder={t('pipeline.glossaryNotes')}
                  aria-label={`${t('pipeline.glossaryNotes')} ${i + 1}`}
                />
                {isDuplicate && (
                  <span className="text-[9px] uppercase tracking-widest text-editorial-warning font-bold pl-1">
                    {t('pipeline.duplicateTerm')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
