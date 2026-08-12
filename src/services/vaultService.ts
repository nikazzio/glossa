import { invoke } from '@tauri-apps/api/core';
import { select } from './dbService';

/**
 * Il deposito: dove vivono i file scaricati dalle biblioteche.
 * Decisioni in `docs-dev/BLOCCO_1_DECISIONI.md`, parti A e B.
 */

/** Radice del deposito. Vuota = dentro la cartella dati (D1). */
const VAULT_ROOT_KEY = 'vault_root';
/** Modalità di lettura globale (D8, D9). */
const READ_MODE_KEY = 'source_read_mode';

export type SourceReadMode = 'auto' | 'local' | 'remote';

export interface VaultStatus {
  path: string;
  /**
   * Falso quando la radice non esiste: disco staccato, condivisione non
   * montata, cartella cloud non sincronizzata. È un caso **diverso** da file
   * mancante (D1): con la radice assente gli stati non si toccano.
   */
  reachable: boolean;
  isDefault: boolean;
}

export type VaultFolderKind = 'empty' | 'existingVault' | 'foreign';

export interface VaultFolderCheck {
  kind: VaultFolderKind;
  writable: boolean;
}

/**
 * `invalid` è il percorso rifiutato perché uscirebbe dal deposito: la riga si
 * segna e le altre proseguono, invece di far fallire l'intera verifica.
 */
export type VaultPresenceState = 'present' | 'missing' | 'invalid';

export interface VaultFileCheck {
  vaultPath: string;
  state: VaultPresenceState;
  detail: string | null;
}

export type VaultFileState = 'valid' | 'corrupt' | 'missing' | 'invalid';

export interface VaultFileIntegrity {
  vaultPath: string;
  state: VaultFileState;
  detail: string | null;
  checksum: string | null;
}

export interface FreedSpace {
  deletedFiles: number;
  freedBytes: number;
}

async function readSetting(key: string): Promise<string | null> {
  const rows = await select<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function getConfiguredVaultRoot(): Promise<string | null> {
  const value = await readSetting(VAULT_ROOT_KEY);
  return value && value.trim() ? value : null;
}

export async function getVaultStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>('get_vault_status', {
    configuredRoot: await getConfiguredVaultRoot(),
  });
}

/** Classifica una cartella candidata prima di adottarla (D1). Non modifica niente. */
export async function checkVaultFolder(path: string): Promise<VaultFolderCheck> {
  return invoke<VaultFolderCheck>('check_vault_folder', { path });
}

export async function initializeVault(): Promise<void> {
  await invoke('initialize_vault', { configuredRoot: await getConfiguredVaultRoot() });
}

export async function getSourceReadMode(): Promise<SourceReadMode> {
  const value = await readSetting(READ_MODE_KEY);
  return value === 'local' || value === 'remote' ? value : 'auto';
}

/**
 * Percorsi attesi di una digitalizzazione completa: manifesto, miniature e
 * carte. Li costruisce il backend perché la disposizione di D2 viva in un posto
 * solo e non venga duplicata qui.
 */
export async function expectedVersionPaths(
  providerKey: string,
  versionId: string,
  sizeTag: string,
  pageCount: number,
): Promise<string[]> {
  return invoke<string[]>('expected_version_paths', { providerKey, versionId, sizeTag, pageCount });
}

/**
 * Verifica rapida di presenza (D5): elenca e confronta, non ricalcola le
 * impronte. Solleva `vault_unreachable` se la radice non c'è, invece di
 * dichiarare tutto mancante.
 */
export async function verifyFilesPresent(vaultPaths: string[]): Promise<VaultFileCheck[]> {
  return invoke<VaultFileCheck[]>('verify_files_present', {
    configuredRoot: await getConfiguredVaultRoot(),
    vaultPaths,
  });
}

/**
 * Verifica completa di integrità (D5): apre ogni file. Lenta in proporzione ai
 * gigabyte, e su un deposito sincronizzato in streaming costringe il client a
 * scaricare tutto (D1-bis): va avvisato prima di partire.
 */
export async function verifyFilesIntegrity(vaultPaths: string[]): Promise<VaultFileIntegrity[]> {
  return invoke<VaultFileIntegrity[]>('verify_files_integrity', {
    configuredRoot: await getConfiguredVaultRoot(),
    vaultPaths,
  });
}

/**
 * "Libera spazio" (D6): cancella le carte scaricate subito e per davvero, senza
 * passare dal cestino — spostare gigabyte nel cestino non libera niente.
 * Restano manifesto e miniature, così il libro resta sfogliabile.
 */
export async function freeVersionPages(providerKey: string, versionId: string): Promise<FreedSpace> {
  return invoke<FreedSpace>('free_version_pages', {
    configuredRoot: await getConfiguredVaultRoot(),
    providerKey,
    versionId,
  });
}

export type SourceAvailability = 'catalogued' | 'partial' | 'complete';

export interface AvailabilitySummary {
  availability: SourceAvailability;
  presentPages: number;
  expectedPages: number;
}

/**
 * Disponibilità calcolata dai file davvero presenti (D7).
 *
 * `partial` **non è un avviso**: chi scarica tre carte su duecento apposta non
 * deve trovarsi una bandierina addosso. Il colore lo mettono altrove i problemi
 * veri — scaricamento fallito, file mancanti o corrotti trovati da una verifica.
 */
export function summarizeAvailability(presentPages: number, expectedPages: number): AvailabilitySummary {
  if (expectedPages <= 0 || presentPages <= 0) {
    return { availability: 'catalogued', presentPages, expectedPages };
  }
  return {
    availability: presentPages >= expectedPages ? 'complete' : 'partial',
    presentPages,
    expectedPages,
  };
}
