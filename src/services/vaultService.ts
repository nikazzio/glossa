import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';

/**
 * Il deposito: dove vivono i file scaricati dalle biblioteche.
 * Decisioni in `docs-dev/BLOCCO_1_DECISIONI.md`, parti A e B.
 */

/** Radice del deposito. Vuota = dentro la cartella dati (D1). */
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

export interface FreedSpace {
  deletedFiles: number;
  freedBytes: number;
}

async function readSetting(key: string): Promise<string | null> {
  const rows = await select<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function getVaultStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>('get_vault_status');
}

export type VaultFolderKindResult = VaultFolderKind;

export interface VaultChoice {
  path: string;
  kind: VaultFolderKindResult;
  writable: boolean;
  /** La cartella è stata davvero adottata come deposito. */
  adopted: boolean;
  /**
   * La cartella sembra dentro un servizio di sincronizzazione (D1-bis): in
   * modalità streaming i file risultano presenti ma occupano zero byte.
   */
  syncFolder: boolean;
}

/**
 * Apre la finestra di scelta cartella **dal backend** e adotta il deposito, come
 * l'import documenti dopo #405: il percorso non attraversa mai l'interfaccia.
 * Restituisce `null` se la scelta viene annullata.
 */
export async function chooseVaultFolder(): Promise<VaultChoice | null> {
  return invoke<VaultChoice | null>('choose_vault_folder');
}

/** "Tieni tutto insieme": deposito dentro la cartella dati (D1). */
export async function adoptDefaultVaultFolder(): Promise<VaultStatus> {
  return invoke<VaultStatus>('use_default_vault_folder');
}

export async function initializeVault(): Promise<void> {
  await invoke('initialize_vault');
}

const VERIFY_ON_STARTUP_KEY = 'verify_vault_on_startup';

/**
 * Controllo rapido del deposito all'apertura (D5), **spento di default**:
 * allunga l'avvio su depositi grandi o su una condivisione di rete, quindi lo
 * accende chi vuole trovare le segnalazioni già pronte.
 */
export async function getVerifyVaultOnStartup(): Promise<boolean> {
  return (await readSetting(VERIFY_ON_STARTUP_KEY)) === '1';
}

export async function setVerifyVaultOnStartup(enabled: boolean): Promise<void> {
  await execute(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [VERIFY_ON_STARTUP_KEY, enabled ? '1' : '0'],
  );
}

export async function getSourceReadMode(): Promise<SourceReadMode> {
  const value = await readSetting(READ_MODE_KEY);
  return value === 'local' || value === 'remote' ? value : 'auto';
}

/**
 * "Libera spazio" (D6): cancella le carte scaricate subito e per davvero, senza
 * passare dal cestino — spostare gigabyte nel cestino non libera niente.
 * Restano manifesto e miniature, così il libro resta sfogliabile.
 */
export async function freeVersionPages(providerKey: string, versionId: string): Promise<FreedSpace> {
  return invoke<FreedSpace>('free_version_pages', { providerKey, versionId });
}

/**
 * Cancella tutto quello che una digitalizzazione ha nel deposito — manifesto,
 * miniature, pagine — quando l'opera esce dalla Biblioteca (D6).
 */
export async function deleteVersionFiles(providerKey: string, versionId: string): Promise<FreedSpace> {
  return invoke<FreedSpace>('delete_version_files', { providerKey, versionId });
}

/** L'esito di un controllo del deposito, come lo mostrano le impostazioni. */
export interface VaultCheckOutcome {
  /** Quando è finito. */
  at: string | null;
  full: boolean;
  intact: number;
  missing: number;
  corrupt: number;
  orphans: number;
  orphanBytes: number;
}

/**
 * L'ultimo controllo del deposito finito.
 *
 * Si legge dal registro dei lavori, che è dove l'esito è già scritto: senza,
 * per sapere com'è andata bisognava guardare il pannello dei Lavori mentre la
 * riga era ancora lì, e dopo un giorno spariva.
 */
export async function lastVaultCheck(): Promise<VaultCheckOutcome | null> {
  const rows = await select<{ detail: string | null; finished_at: string | null }>(
    `SELECT detail, finished_at FROM jobs
      WHERE job_type = 'vault_verification' AND status = 'completed'
      ORDER BY COALESCE(finished_at, updated_at) DESC
      LIMIT 1`,
  );
  if (rows.length === 0 || !rows[0].detail) return null;
  try {
    const parsed: unknown = JSON.parse(rows[0].detail);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const count = (value: unknown): number => (typeof value === 'number' ? value : 0);
    const orphans = (record.orphans ?? {}) as Record<string, unknown>;
    return {
      at: rows[0].finished_at,
      full: record.level === 'full',
      intact: count(record.intact),
      missing: count(record.missing),
      corrupt: count(record.corrupt),
      orphans: count(orphans.count),
      orphanBytes: count(orphans.bytes),
    };
  } catch {
    return null;
  }
}

/**
 * Cancella i file che nessuna riga reclama (D5-bis).
 *
 * Il backend riguarda il deposito nel momento in cui si preme, invece di
 * fidarsi del conto dell'ultimo controllo: fra i due può essere finito uno
 * scaricamento, e quei file non sono più orfani.
 */
export async function deleteVaultOrphans(): Promise<FreedSpace> {
  return invoke<FreedSpace>('delete_vault_orphans');
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
 * `partial` **non è un avviso**: chi scarica tre pagine su duecento apposta non
 * deve trovarsi una bandierina addosso. Il colore lo mettono altrove i problemi
 * veri — scaricamento fallito, file mancanti o corrotti trovati da una verifica.
 *
 * `notServed` sono le pagine che la biblioteca ha dichiarato di non servire
 * (§5.3): non mancano per colpa nostra e non si recuperano riscaricando, quindi
 * un libro che le ha tutte tranne quelle è **completo per quanto la biblioteca
 * serve**, non a metà.
 */
export function summarizeAvailability(
  presentPages: number,
  expectedPages: number,
  notServed = 0,
): AvailabilitySummary {
  if (expectedPages <= 0 || presentPages <= 0) {
    return { availability: 'catalogued', presentPages, expectedPages };
  }
  return {
    availability: presentPages + notServed >= expectedPages ? 'complete' : 'partial',
    presentPages,
    expectedPages,
  };
}
