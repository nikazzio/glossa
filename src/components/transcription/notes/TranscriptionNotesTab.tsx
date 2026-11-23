import { useMemo, useState } from 'react';
import { FileText, MessageSquare, Plus, TextQuote, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChoiceDots, EmptyState, IconButton, PANEL_BODY_CLASSNAME, PanelSection } from '../../ui';
import { TRANSCRIPTION_NOTE_TYPES, type TranscriptionNoteType } from '../../../services/transcriptionNotesService';
import type { TranscriptionNoteUpdate } from '../../../services/transcriptionNotesService';
import type { NoteGroups, PassageChoice, PlacedNote } from './usePageNotes';
import { NOTE_TYPE_META, noteTypeLabelKey } from './noteTypes';
import { NoteForm, TranscriptionNoteCard, type NoteDraft } from './TranscriptionNoteCard';

type NoteFilter = 'all' | TranscriptionNoteType;

/** Una nota nuova in scrittura: della pagina, o sul passaggio selezionato. */
export interface NewNoteRequest {
  passage: PassageChoice | null;
  requestId: number;
}

interface TranscriptionNotesTabProps {
  groups: NoteGroups;
  selectedNoteId: string | null;
  /** Il passaggio selezionato ora nel testo, per riagganciare una nota. */
  selectionPassage: PassageChoice | null;
  newNote: NewNoteRequest | null;
  onNewNote: (request: NewNoteRequest | null) => void;
  onCreate: (draft: NoteDraft, passage: PassageChoice | null) => void;
  onUpdate: (id: string, updates: TranscriptionNoteUpdate) => void;
  onDelete: (id: string) => void;
  onLocate: (id: string) => void;
}

/**
 * Scheda Note dello Studio di trascrizione: le note della pagina in tre
 * gruppi — della pagina intera, nel testo (in ordine di lettura), da
 * riagganciare — con il filtro per tipo.
 */
export function TranscriptionNotesTab({
  groups,
  selectedNoteId,
  selectionPassage,
  newNote,
  onNewNote,
  onCreate,
  onUpdate,
  onDelete,
  onLocate,
}: TranscriptionNotesTabProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<NoteFilter>('all');
  const all = useMemo(() => [...groups.page, ...groups.text, ...groups.detached], [groups]);
  const count = (type: TranscriptionNoteType) => all.filter(({ note }) => note.type === type).length;
  const shown = (placed: PlacedNote[]) => (filter === 'all' ? placed : placed.filter(({ note }) => note.type === filter));

  const filterOptions = [
    { value: 'all' as const, label: t('transcription.notes.filterAll', { count: all.length }), content: <span>{all.length}</span> },
    ...TRANSCRIPTION_NOTE_TYPES.map((type) => {
      const Icon = NOTE_TYPE_META[type].icon;
      const total = count(type);
      return {
        value: type,
        label: t('transcription.notes.filterType', { type: t(noteTypeLabelKey(type)), count: total }),
        content: <Icon size={11} aria-hidden="true" />,
        disabled: total === 0 && filter !== type,
      };
    }),
  ];

  const renderGroup = (placed: PlacedNote[], detached: boolean) => (
    <ul className="divide-y divide-rule-faint">
      {shown(placed).map(({ note, range }) => (
        <TranscriptionNoteCard
          key={note.id}
          note={note}
          detached={detached}
          selected={note.id === selectedNoteId}
          canReattach={selectionPassage !== null}
          onLocate={range ? () => onLocate(note.id) : undefined}
          onReattach={() => {
            if (selectionPassage) onUpdate(note.id, { passage: selectionPassage.passage, occurrence: selectionPassage.occurrence });
          }}
          onSave={(draft) => onUpdate(note.id, draft)}
          onDelete={() => onDelete(note.id)}
        />
      ))}
    </ul>
  );

  const sections: Array<{ key: string; icon: typeof FileText; label: string; placed: PlacedNote[]; detached: boolean }> = [
    { key: 'page', icon: FileText, label: t('transcription.notes.groupPage'), placed: groups.page, detached: false },
    { key: 'text', icon: TextQuote, label: t('transcription.notes.groupText'), placed: groups.text, detached: false },
    { key: 'detached', icon: Unlink, label: t('transcription.notes.groupDetached'), placed: groups.detached, detached: true },
  ];
  const visible = sections.filter((section) => shown(section.placed).length > 0);

  return (
    <div className={PANEL_BODY_CLASSNAME}>
      <div className="flex items-center justify-between gap-2">
        <ChoiceDots
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          ariaLabel={t('transcription.notes.filter')}
          tooltipSide="bottom"
        />
        <IconButton size="sm" onClick={() => onNewNote({ passage: null, requestId: Date.now() })} title={t('transcription.notes.addPageNote')}>
          <Plus size={14} />
        </IconButton>
      </div>

      {newNote ? (
        <PanelSection icon={MessageSquare} label={t('transcription.notes.newNote')}>
          <NoteForm
            key={newNote.requestId}
            initial={{ type: 'note', content: '' }}
            passage={newNote.passage?.passage ?? null}
            onSave={(draft) => { onCreate(draft, newNote.passage); onNewNote(null); }}
            onCancel={() => onNewNote(null)}
          />
        </PanelSection>
      ) : null}

      {visible.length === 0 && !newNote ? (
        <EmptyState
          icon={<MessageSquare size={20} aria-hidden="true" />}
          message={t(all.length === 0 ? 'transcription.notes.empty' : 'transcription.notes.emptyFilter')}
          hint={all.length === 0 ? t('transcription.notes.emptyHint') : undefined}
        />
      ) : (
        visible.map((section) => (
          <PanelSection key={section.key} icon={section.icon} label={section.label}>
            {renderGroup(section.placed, section.detached)}
          </PanelSection>
        ))
      )}
    </div>
  );
}
