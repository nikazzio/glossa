import { create } from 'zustand';
import type { TranslationChunk } from '../types';

interface TranslationHistoryState {
  /** Testo dell'ultima versione di ogni frammento della pipeline aperta: dice
   *  se il dischetto ha una versione nuova da scrivere. */
  latestText: Record<string, string>;
  /** Cresce a ogni versione scritta: lo storico aperto si rilegge. */
  revisionTick: number;
  setLatestTexts: (texts: Record<string, string>) => void;
  noteRevision: (translationId: string, text: string) => void;
}

export const useTranslationHistoryStore = create<TranslationHistoryState>((set) => ({
  latestText: {},
  revisionTick: 0,
  setLatestTexts: (texts) => set({ latestText: texts }),
  noteRevision: (translationId, text) =>
    set((state) => ({
      latestText: { ...state.latestText, [translationId]: text },
      revisionTick: state.revisionTick + 1,
    })),
}));

/** Frammenti il cui testo non è ancora una versione dello storico. I
 *  verificati no: il loro testo è fermo ed è entrato nello storico verificandoli. */
export function unversionedChunks(chunks: TranslationChunk[], latestText: Record<string, string>): TranslationChunk[] {
  return chunks.filter(
    (chunk) => !chunk.translationLocked
      && chunk.translationDisplayText.trim() !== ''
      && latestText[chunk.id] !== chunk.translationDisplayText,
  );
}
