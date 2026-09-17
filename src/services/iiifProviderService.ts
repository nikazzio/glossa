import { invoke } from '@tauri-apps/api/core';
import type { IIIFDiscoveryOutcome, IIIFProvider } from '../types';

export async function listIIIFProviders(): Promise<IIIFProvider[]> {
  return invoke<IIIFProvider[]>('list_iiif_providers');
}

/**
 * `fresh` salta il risultato conservato e ripassa dalla biblioteca: è l'unico
 * modo di sapere se il catalogo è cresciuto prima che quello conservato scada.
 */
export async function discoverIIIF(
  providerKey: string,
  input: string,
  page = 1,
  fresh = false,
): Promise<IIIFDiscoveryOutcome> {
  return invoke<IIIFDiscoveryOutcome>('discover_iiif', { providerKey, input, page, fresh });
}

/** Una rappresentazione alternativa dell'opera dichiarata dalla biblioteca:
 *  lo stesso libro servito in un'altra forma, quasi sempre un documento unico. */
export interface DeclaredRendering {
  url: string;
  format: string | null;
  label: string | null;
}

/**
 * Cosa la biblioteca offre di un'opera, letto dal suo manifesto in un solo
 * passaggio di rete.
 *
 * `openable: null` vuol dire «non si sa»: il servizio non ha risposto, o ha
 * risposto in un modo che non dice niente sull'opera. Solo `false` significa
 * che la biblioteca dichiara di non avere quel libro. Allo stesso modo
 * `document: null` non promette che il documento non esista: promette che il
 * manifesto non lo dichiara.
 */
export interface ManifestFacts {
  openable: boolean | null;
  pages: number | null;
  /** I pixel dichiarati dalla prima pagina: l'unico indizio sulla qualità
   *  della scansione che il manifesto dà senza scaricare un'immagine. */
  samplePixels: [number, number] | null;
  document: DeclaredRendering | null;
  renderings: DeclaredRendering[];
}

export async function inspectManifest(
  providerKey: string,
  manifestUrl: string,
): Promise<ManifestFacts> {
  return invoke<ManifestFacts>('inspect_manifest', { providerKey, manifestUrl });
}

/**
 * Il manifesto così come la biblioteca lo pubblica.
 *
 * È la sua dichiarazione sull'opera — pagine, misure, diritti, provenienza — e
 * nei dati tecnici della scheda si legge per intero invece di ricostruirla da
 * quello che il visore ne mostra.
 */
export async function readManifestText(
  providerKey: string,
  manifestUrl: string,
): Promise<string> {
  return invoke<string>('read_iiif_manifest_text', { providerKey, manifestUrl });
}
