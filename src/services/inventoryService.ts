import { invoke } from '@tauri-apps/api/core';

/**
 * L'inventario del deposito: quante pagine ci sono di una digitalizzazione, a
 * che misure, e quanto occupano.
 *
 * Sostituisce il conteggio sulle righe `assets`, che non esistono più per le
 * pagine: la cartella è la sola verità, e queste funzioni la
 * leggono attraverso il motore, che è l'unico a conoscere la radice del
 * deposito.
 */

export interface SizeFolder {
  /** Il nome della cartella, cioè il **tetto** con cui si è scaricato. */
  sizeTag: string;
  pages: number;
  bytes: number;
  /** Pagine che la biblioteca ha dichiarato di non servire. */
  missing: number;
  /** Vero per una copia ricavata in locale (compressione), falso per una scaricata davvero. */
  derived: boolean;
}

export interface VersionInventory {
  versionId: string;
  providerKey: string;
  sizes: SizeFolder[];
  /** La misura con cui il libro è stato scaricato: quella con più pagine. */
  principal: string | null;
  hasManifest: boolean;
}

export async function versionInventory(versionId: string): Promise<VersionInventory | null> {
  return invoke<VersionInventory | null>('version_inventory', { versionId });
}

export async function libraryInventory(): Promise<VersionInventory[]> {
  return invoke<VersionInventory[]>('library_inventory');
}

/** Le pagine della misura principale: il conteggio che la scheda mostra. */
export function principalPages(inventory: VersionInventory): number {
  const principal = inventory.sizes.find((size) => size.sizeTag === inventory.principal);
  return principal?.pages ?? 0;
}

/** Quanto occupa in tutto, tutte le misure comprese. */
export function inventoryBytes(inventory: VersionInventory): number {
  return inventory.sizes.reduce((total, size) => total + size.bytes, 0);
}
