import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry } from '../../types';
import { generateId } from '../../utils';
import { Hint, IconButton } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

interface Props {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
  readOnly?: boolean;
  sourceReadOnly?: boolean;
  actions?: ReactNode;
}

export function DictionaryEntryEditor({ entries, onChange, readOnly = false, sourceReadOnly = false, actions }: Props) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notesId, setNotesId] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!editingId) return;
    fieldRef.current?.focus();
    fieldRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [editingId]);

  const duplicateTermIds = useMemo(() => {
    const counts = new Map<string, string[]>();
    for (const entry of entries) {
      if (!entry.term.trim() || !entry.id) continue;
      const term = entry.term.trim().toLocaleLowerCase();
      counts.set(term, [...(counts.get(term) ?? []), entry.id]);
    }
    return new Set([...counts.values()].filter((ids) => ids.length > 1).flat());
  }, [entries]);

  const addEntry = () => {
    const id = generateId('gle');
    onChange([{ id, term: '', translation: '' }, ...entries]);
    setEditingId(id);
    setNotesId(null);
  };
  const updateEntry = (id: string, updates: Partial<GlossaryEntry>) => {
    onChange(entries.map((entry) => entry.id === id ? { ...entry, ...updates } : entry));
  };

  return <div className="space-y-2">
    <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] items-center gap-4 bg-surface-resource py-2">
      <span className="caption-label">{t('pipeline.source')}</span>
      <span className="caption-label">{t('pipeline.target')}</span>
      <div className="flex items-center gap-1">
        {actions}
        {!readOnly && <IconButton onClick={addEntry} title={t('pipeline.addGlossaryEntry')} size="sm"><Plus size={14} /></IconButton>}
      </div>
    </div>
    {entries.length === 0 ? <p className="py-6 text-center text-sm italic text-editorial-muted">{t('pipeline.glossaryEmpty')}</p>
      : <div className="divide-y divide-rule-faint">
        {entries.map((entry, index) => {
          const id = entry.id;
          const editing = id !== undefined && editingId === id && !readOnly;
          const notesOpen = notesId === id;
          const sourceLocked = readOnly || sourceReadOnly && entry.overridden !== undefined;
          const duplicate = id !== undefined && duplicateTermIds.has(id);
          return <div key={id ?? `entry-${index}`} className="space-y-2 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] items-start gap-4">
              {editing ? <>
                <textarea ref={sourceLocked ? undefined : fieldRef} value={entry.term} rows={2}
                  onChange={(event) => id && updateEntry(id, { term: event.target.value })} readOnly={sourceLocked}
                  aria-label={`${t('pipeline.source')} ${index + 1}`} className={`${FIELD_CLASSNAME} resize-y`} />
                <textarea ref={sourceLocked ? fieldRef : undefined} value={entry.translation} rows={2}
                  onChange={(event) => id && updateEntry(id, { translation: event.target.value })}
                  aria-label={`${t('pipeline.target')} ${index + 1}`} className={`${FIELD_CLASSNAME} resize-y`} />
              </> : <>
                <p className="break-words font-display text-sm italic text-editorial-ink">{entry.term || '—'}</p>
                <p className="break-words text-sm text-editorial-ink">{entry.translation || '—'}</p>
              </>}
              <div className="flex flex-wrap justify-end gap-1">
                {duplicate && <Hint label={t('pipeline.duplicateTerm')}><AlertTriangle size={14} className="text-editorial-warning" /></Hint>}
                {(editing || entry.notes) && <IconButton size="xs" title={t('pipeline.glossaryNotes')} aria-expanded={notesOpen}
                  aria-controls={`entry-notes-${id}`} onClick={() => setNotesId(notesOpen ? null : id ?? null)}><NotebookPen size={13} /></IconButton>}
                {!readOnly && <>
                  <IconButton size="xs" title={editing ? t('library.finishEntry') : `${t('common.edit')}: ${entry.term}`}
                    onClick={() => setEditingId(editing ? null : id ?? null)}>{editing ? <Check size={13} /> : <Pencil size={13} />}</IconButton>
                  <IconButton size="xs" title={`${t('pipeline.removeGlossaryEntry')} ${index + 1}`}
                    onClick={() => { onChange(entries.filter((item) => item.id !== id)); if (editingId === id) setEditingId(null); }}><Trash2 size={13} /></IconButton>
                </>}
              </div>
            </div>
            {notesOpen && <div id={`entry-notes-${id}`} className="pl-1">
              {editing ? <textarea value={entry.notes ?? ''} rows={2} placeholder={t('pipeline.glossaryNotes')}
                aria-label={`${t('pipeline.glossaryNotes')} ${index + 1}`} className={`${FIELD_CLASSNAME} resize-y`}
                onChange={(event) => id && updateEntry(id, { notes: event.target.value })} />
                : <p className="break-words text-xs italic text-editorial-muted">{entry.notes}</p>}
            </div>}
          </div>;
        })}
      </div>}
  </div>;
}
