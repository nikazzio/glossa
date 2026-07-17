import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry } from '../../types';
import { generateId } from '../../utils';
import { IconButton } from '../ui';

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
    onChange([{ id: generateId('gle'), term: '', translation: '' }, ...entries]);
  };

  const updateEntry = (id: string, updates: Partial<GlossaryEntry>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
          {t('pipeline.keywordRegistry')}
          {entries.length > 0 && (
            <span className="ml-2 font-mono font-normal normal-case tracking-normal text-editorial-muted/60">
              ({entries.length})
            </span>
          )}
        </span>
        {!readOnly && (
          <IconButton onClick={addEntry} title={t('pipeline.addGlossaryEntry')} size="xs">
            <Plus size={16} />
          </IconButton>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="border-y border-dashed border-editorial-border/70 py-6 text-center text-xs italic text-editorial-muted/60">
          {t('pipeline.glossaryEmpty')}
        </p>
      ) : (
        <div className="overflow-y-auto custom-scrollbar max-h-[420px] pr-2">
          {/* Intestazioni colonne (sticky) */}
          <div className="sticky top-0 z-10 grid grid-cols-[1fr_1fr_auto] border-b border-editorial-border bg-editorial-textbox/80 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
              {t('pipeline.source')}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
              {t('pipeline.target')}
            </span>
            <span className="w-7" />
          </div>

          {entries.map((g, i) => {
            const rowKey = g.id ?? `gle-fallback-${i}`;
            const isDuplicate = g.id ? duplicateTermIds.has(g.id) : false;
            const removeLabel = `${t('pipeline.removeGlossaryEntry')} ${i + 1}`;
            return (
              <div
                key={rowKey}
                className={`group border-b border-editorial-border/60 last:border-b-0 ${
                  isDuplicate ? 'bg-editorial-warning/8' : 'hover:bg-editorial-textbox/30'
                }`}
              >
                <div className="grid grid-cols-[1fr_1fr_auto] items-stretch">
                  <input
                    value={g.term}
                    onChange={(e) => g.id && updateEntry(g.id, { term: e.target.value })}
                    readOnly={readOnly}
                    placeholder={t('pipeline.source')}
                    aria-label={`${t('pipeline.source')} ${i + 1}`}
                    className="border-r border-editorial-border/40 bg-transparent px-3 py-2 text-[12px] font-mono text-editorial-ink outline-none placeholder:text-editorial-muted/35 focus:bg-editorial-accent/5 read-only:opacity-60"
                  />
                  <input
                    value={g.translation}
                    onChange={(e) => g.id && updateEntry(g.id, { translation: e.target.value })}
                    readOnly={readOnly}
                    placeholder={t('pipeline.target')}
                    aria-label={`${t('pipeline.target')} ${i + 1}`}
                    className="bg-transparent px-3 py-2 text-[12px] font-mono text-editorial-ink outline-none placeholder:text-editorial-muted/35 focus:bg-editorial-accent/5 read-only:opacity-60"
                  />
                  {!readOnly ? (
                    <IconButton
                      onClick={() => g.id && removeEntry(g.id)}
                      title={removeLabel}
                      size="xs"
                      className="border-transparent text-editorial-muted/25 hover:border-transparent hover:text-editorial-accent group-hover:text-editorial-muted/50"
                    >
                      <X size={16} />
                    </IconButton>
                  ) : (
                    <span className="w-7" />
                  )}
                </div>
                {/* Riga note — sempre presente ma minimale */}
                <input
                  value={g.notes ?? ''}
                  onChange={(e) => g.id && updateEntry(g.id, { notes: e.target.value })}
                  readOnly={readOnly}
                  placeholder={t('pipeline.glossaryNotes')}
                  aria-label={`${t('pipeline.glossaryNotes')} ${i + 1}`}
                  className="w-full border-t border-editorial-border/25 bg-editorial-textbox/20 px-3 py-1.5 pl-5 text-xs font-mono text-editorial-muted/70 outline-none placeholder:text-editorial-muted/30 focus:bg-editorial-accent/5 read-only:opacity-60"
                />
                {isDuplicate && (
                  <div className="border-t border-editorial-warning/30 bg-editorial-warning/8 px-3 py-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-warning">
                      {t('pipeline.duplicateTerm')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
