import { invoke } from '@tauri-apps/api/core';
import type { LanguageSourceTexts } from '../languages/build';

/** I due elenchi nel formato incluso nell'app, come testo JSON. */
export interface SavedLanguageLists {
  iso: string;
  varieties: string;
}

/** L'elenco scaricato con «Aggiorna elenco lingue», se c'è. */
export function readSavedLanguageLists(): Promise<SavedLanguageLists | null> {
  return invoke<SavedLanguageLists | null>('languages_read_saved');
}

export function saveLanguageLists(lists: SavedLanguageLists): Promise<void> {
  return invoke('languages_save', { lists });
}

export function fetchLanguageSources(): Promise<LanguageSourceTexts> {
  return invoke<LanguageSourceTexts>('languages_fetch_sources');
}
