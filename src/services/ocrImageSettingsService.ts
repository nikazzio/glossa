import { getSetting, setSetting } from './dbService';
import { DEFAULT_OCR_IMAGE_EDGE, OCR_IMAGE_EDGES } from '../constants';

/**
 * Quale immagine della pagina parte verso il modello OCR, per tutta l'app.
 * `optimized`: ridotta al lato lungo scelto e ricompressa. `local`: la copia
 * già sul computer — libro scaricato o cache del visore — così com'è. Nello
 * Studio si può cambiare per la sessione, senza salvarla nel documento.
 */
export type OcrImageMode = 'optimized' | 'local';

export interface OcrImagePreferences {
  edge: number;
  mode: OcrImageMode;
}

const EDGE_KEY = 'ocr_image_edge';
const MODE_KEY = 'ocr_image_mode';

export const DEFAULT_OCR_IMAGE_PREFERENCES: OcrImagePreferences = {
  edge: DEFAULT_OCR_IMAGE_EDGE,
  mode: 'optimized',
};

function isKnownEdge(value: number): boolean {
  return (OCR_IMAGE_EDGES as readonly number[]).includes(value);
}

export async function getOcrImagePreferences(): Promise<OcrImagePreferences> {
  const [edge, mode] = await Promise.all([getSetting(EDGE_KEY), getSetting(MODE_KEY)]);
  const parsedEdge = Number(edge);
  return {
    edge: isKnownEdge(parsedEdge) ? parsedEdge : DEFAULT_OCR_IMAGE_PREFERENCES.edge,
    mode: mode === 'local' || mode === 'optimized' ? mode : DEFAULT_OCR_IMAGE_PREFERENCES.mode,
  };
}

export async function setOcrImageEdge(edge: number): Promise<void> {
  if (!isKnownEdge(edge)) throw new Error(`misura OCR non prevista: ${edge}`);
  await setSetting(EDGE_KEY, String(edge));
}

export async function setOcrImageMode(mode: OcrImageMode): Promise<void> {
  await setSetting(MODE_KEY, mode);
}
