import { useEffect, useRef, useState } from 'react';
import { Check, Crosshair, Link, Pencil, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Select, Tooltip } from '../../ui';
import { PageEditor } from '../../editor/PageEditor';
import {
  TRANSCRIPTION_NOTE_TYPES,
  isTranscriptionNoteType,
  type TranscriptionNote,
  type TranscriptionNoteType,
} from '../../../services/transcriptionNotesService';
import { NOTE_TYPE_META, noteTypeHintKey, noteTypeLabelKey } from './noteTypes';

export interface NoteDraft {
  type: TranscriptionNoteType;
  content: string;
}

interface NoteFormProps {
  initial: NoteDraft;
  passage: string | null;
  /** Vero se la nota è stata salvata: solo allora il modulo si chiude. */
  onSave: (draft: NoteDraft) => Promise<boolean>;
  onCancel: () => void;
}

/** Tipo e testo di una nota, da confermare o annullare. */
export function NoteForm({ initial, passage, onSave, onCancel }: NoteFormProps) {
  const { t } = useTranslation();
  const [type, setType] = useState(initial.type);
  const [content, setContent] = useState(initial.content);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const saved = await onSave({ type, content: content.trim() });
    // Salvata, il modulo si chiude e sparisce: niente stato da aggiornare.
    if (!saved) setSaving(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={type}
          onChange={(value) => { if (isTranscriptionNoteType(value)) setType(value); }}
          ariaLabel={t('transcription.notes.type')}
          className="flex-1"
          options={TRANSCRIPTION_NOTE_TYPES.map((value) => ({ value, label: t(noteTypeLabelKey(value)) }))}
        />
        <IconButton size="sm" onClick={() => void save()} disabled={saving} title={t('transcription.notes.save')}>
          <Check size={13} />
        </IconButton>
        <IconButton size="sm" onClick={onCancel} disabled={saving} title={t('transcription.notes.cancel')}>
          <X size={13} />
        </IconButton>
      </div>
      {passage ? <p className="truncate text-xs italic text-editorial-muted">«{passage}»</p> : null}
      <div className="rounded-lg bg-editorial-textbox px-2 py-1">
        <PageEditor
          compact
          value={content}
          onChange={setContent}
          identityKey="note"
          ariaLabel={t('transcription.notes.text')}
          placeholder={t('transcription.notes.textPlaceholder')}
        />
      </div>
    </div>
  );
}

interface NoteCardProps {
  note: TranscriptionNote;
  detached: boolean;
  selected: boolean;
  canReattach: boolean;
  onLocate?: () => void;
  onReattach: () => void;
  onSave: (draft: NoteDraft) => Promise<boolean>;
  onDelete: () => void;
}

export function TranscriptionNoteCard({
  note,
  detached,
  selected,
  canReattach,
  onLocate,
  onReattach,
  onSave,
  onDelete,
}: NoteCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);
  const meta = NOTE_TYPE_META[note.type];
  const Icon = meta.icon;

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  if (editing) {
    return (
      <li ref={ref} className="py-3">
        <NoteForm
          initial={{ type: note.type, content: note.content }}
          passage={note.passage}
          onSave={async (draft) => {
            const saved = await onSave(draft);
            if (saved) setEditing(false);
            return saved;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      ref={ref}
      aria-current={selected || undefined}
      className={`group -mx-2 rounded-lg border-l-2 px-2 py-3 transition-colors hover:bg-surface-hover/50 ${
        selected ? 'border-editorial-accent bg-surface-hover/50' : 'border-transparent'
      } ${detached ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <Tooltip label={t(noteTypeHintKey(note.type))}>
          <span className={`flex min-w-0 items-center gap-1.5 ${meta.colorClass}`}>
            <Icon size={13} className="shrink-0" aria-hidden="true" />
            <span className="truncate text-caption font-bold uppercase tracking-section">{t(noteTypeLabelKey(note.type))}</span>
          </span>
        </Tooltip>
        <span className="flex-1" />
        <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {confirmingDelete ? (
            <>
              <span className="text-xs text-editorial-danger">{t('transcription.notes.confirmDelete')}</span>
              <IconButton size="xs" tone="danger" onClick={onDelete} title={t('transcription.notes.confirmDeleteYes')}>
                <Trash2 size={11} />
              </IconButton>
              <IconButton size="xs" onClick={() => setConfirmingDelete(false)} title={t('transcription.notes.confirmDeleteNo')}>
                <X size={11} />
              </IconButton>
            </>
          ) : (
            <>
              {detached ? (
                <IconButton
                  size="xs"
                  onClick={onReattach}
                  disabled={!canReattach}
                  title={canReattach ? t('transcription.notes.reattach') : t('transcription.notes.reattachNeedsSelection')}
                >
                  <Link size={11} />
                </IconButton>
              ) : null}
              {onLocate ? (
                <IconButton size="xs" onClick={onLocate} title={t('transcription.notes.locate')}>
                  <Crosshair size={11} />
                </IconButton>
              ) : null}
              <IconButton size="xs" onClick={() => setEditing(true)} title={t('transcription.notes.edit')}>
                <Pencil size={11} />
              </IconButton>
              <IconButton size="xs" onClick={() => setConfirmingDelete(true)} title={t('transcription.notes.delete')}>
                <Trash2 size={11} />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {note.passage ? (
        <p className="mt-1 truncate text-xs italic text-editorial-muted">
          «{note.passage}»{detached ? ` — ${t('transcription.notes.notFound')}` : ''}
        </p>
      ) : null}
      {note.content ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-editorial-ink">{note.content}</p>
      ) : null}
    </li>
  );
}
