import { MAX_SIZE_CAP } from '../services/downloadSettingsService';

/**
 * Il nome leggibile di una misura: con l'unità, non il numero grezzo, e «la più
 * grande disponibile» per l'ultimo scalino della scala.
 *
 * Sta fuori dalla scheda dell'opera perché la dice anche il visore, quando
 * dichiara a che misura conserverà la pagina aperta: due formule diverse per la
 * stessa cartella avrebbero raccontato due cose.
 */
export function resolutionLabel(
  tag: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (tag === MAX_SIZE_CAP) return t('settings.download.sizeCapMax');
  // Solo un numero è davvero un lato lungo in pixel: una biblioteca può
  // dichiarare una risoluzione fuori scala con un'etichetta propria (es.
  // "full"), e inventarle un'unità di misura sarebbe falso.
  return /^\d+$/.test(tag) ? t('settings.download.pixels', { value: tag }) : tag;
}
