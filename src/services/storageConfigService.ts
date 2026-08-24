import { invoke } from '@tauri-apps/api/core';

export interface DataDirStatus {
  path: string;
  isOverride: boolean;
}

export async function getDataDir(): Promise<DataDirStatus> {
  return invoke<DataDirStatus>('get_data_dir');
}

/**
 * Apre la finestra di scelta cartella **dal backend** e sposta lì la cartella
 * dati, come già fanno l'import documenti (#405) e la cartella del deposito: il
 * percorso non attraversa l'interfaccia e nessun comando lo accetta come
 * parametro. Restituisce `null` se la scelta viene annullata.
 */
export async function chooseDataDirFolder(): Promise<DataDirStatus | null> {
  return invoke<DataDirStatus | null>('choose_data_dir_folder');
}
