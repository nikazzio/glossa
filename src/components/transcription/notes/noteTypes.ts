import { CaseSensitive, CircleHelp, Ellipsis, MessageSquare, PenLine, Plus, Strikethrough, type LucideIcon } from 'lucide-react';
import type { TranscriptionNoteType } from '../../../services/transcriptionNotesService';

/**
 * Icona, colore e testi di ogni tipo di nota della trascrizione. Colore
 * neutro per tutti; il Dubbio in ocra, il colore della cautela.
 */
export const NOTE_TYPE_META: Record<TranscriptionNoteType, { icon: LucideIcon; colorClass: string }> = {
  emendation: { icon: PenLine, colorClass: 'text-editorial-charcoal' },
  doubt: { icon: CircleHelp, colorClass: 'text-editorial-warning' },
  addition: { icon: Plus, colorClass: 'text-editorial-charcoal' },
  correction: { icon: Strikethrough, colorClass: 'text-editorial-charcoal' },
  typography: { icon: CaseSensitive, colorClass: 'text-editorial-charcoal' },
  abbreviation: { icon: Ellipsis, colorClass: 'text-editorial-charcoal' },
  note: { icon: MessageSquare, colorClass: 'text-editorial-charcoal' },
};

export const noteTypeLabelKey = (type: TranscriptionNoteType) => `transcription.notes.types.${type}.label`;
export const noteTypeHintKey = (type: TranscriptionNoteType) => `transcription.notes.types.${type}.hint`;
