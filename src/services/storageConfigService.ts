import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export interface DataDirStatus {
  path: string;
  isOverride: boolean;
}

export async function getDataDir(): Promise<DataDirStatus> {
  return invoke<DataDirStatus>('get_data_dir');
}

export async function setDataDir(newPath: string): Promise<void> {
  await invoke('set_data_dir', { newPath });
}

/** Opens a native folder picker; returns null if the user cancels. */
export async function pickDataDirFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}

/** Preferenza persistita lato backend (mai passata come argomento alle chiamate
 * di import): #367 limita l'import documenti a Documenti/Download/Scrivania/
 * cartelle app, qui opt-in e disattivato di default. */
export async function getRestrictDocumentImports(): Promise<boolean> {
  return invoke<boolean>('get_restrict_document_imports');
}

export async function setRestrictDocumentImports(value: boolean): Promise<void> {
  await invoke('set_restrict_document_imports', { value });
}
