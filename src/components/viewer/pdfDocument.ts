import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * pdf.js dietro tre funzioni: apri, disegna una pagina, chiudi.
 *
 * Il disegno avviene in un filo separato — è il modo in cui pdf.js lavora —
 * e il file del filo è quello impacchettato con l'applicazione, non uno preso
 * dalla rete.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Le pagine scannerizzate spesso comprimono le immagini in JPEG2000 o JBIG2,
 * che pdf.js decodifica solo con questi moduli WASM — senza `wasmUrl` non
 * prova nemmeno a cercarli, e la pagina non ha niente da disegnare. Copiati
 * in `public/pdfjs/` invece che importati con `?url`: quel percorso li
 * comprimerebbe ognuno con un nome diverso, e pdf.js li cerca con questi nomi
 * esatti in una sola cartella.
 *
 * Ci sono anche i due `*_nowasm_fallback.js`, stessa cartella: se
 * l'istanziazione WASM fallisce (ambiente che non la supporta appieno),
 * pdf.js prova questo ripiego in puro JavaScript, cercandolo con lo stesso
 * `wasmUrl` come base — senza il file lì, quel tentativo di recupero fallisce
 * a sua volta con un 404 invece di disegnare comunque la pagina, più lenta.
 */
const WASM_BASE_URL = '/pdfjs/';

/**
 * A che scala si disegna la pagina.
 *
 * Due volte la misura dichiarata dal documento: una scansione ingrandita resta
 * leggibile, e il costo in memoria di una pagina sola resta accettabile. È il
 * limite dichiarato di questa lettura rispetto alle tessere della biblioteca,
 * che si ridisegnano a ogni livello di zoom.
 */
const RENDER_SCALE = 2;

export interface LoadedDocument {
  pages: number;
  /** Il documento aperto da pdf.js. */
  handle: pdfjs.PDFDocumentProxy;
  /** Disegni della stessa pagina in coda: pdf.js restituisce lo stesso
   *  `PDFPageProxy`, quindi le sue risorse si possono liberare solo quando
   *  non c'è un altro disegno di quella pagina ancora attivo. */
  renderQueues: Map<number, Promise<void>>;
  /** Chiude il documento e ferma il filo che lo teneva: senza, i byte di un
   *  documento che non si sta più leggendo resterebbero in memoria. */
  destroy: () => Promise<void>;
}

/** Apre il documento dai byte già in mano. */
export async function openDocument(bytes: Uint8Array): Promise<LoadedDocument> {
  // Nessuna opzione per disattivare `eval`: questa versione di pdf.js non
  // costruisce più codice al volo, quindi regge la regola di sicurezza della
  // build di rilascio, che lo vieta.
  const task = pdfjs.getDocument({ data: bytes, wasmUrl: WASM_BASE_URL });
  const handle = await task.promise;
  return {
    pages: handle.numPages,
    handle,
    renderQueues: new Map(),
    destroy: () => task.destroy(),
  };
}

/** Disegna una pagina e ne restituisce l'immagine. */
export function renderDocumentPage(
  document: LoadedDocument,
  index: number,
): Promise<Blob> {
  const previous = document.renderQueues.get(index) ?? Promise.resolve();
  const render = previous.catch(() => undefined).then(async () => {
    // pdf.js conta le pagine da uno; qui, come nel resto del visore, da zero.
    const page = await document.handle.getPage(index + 1);
    try {
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas_unavailable');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('page_not_drawn');
      return blob;
    } finally {
      page.cleanup();
    }
  });
  const settled = render.then(() => undefined, () => undefined);
  document.renderQueues.set(index, settled);
  void settled.finally(() => {
    if (document.renderQueues.get(index) === settled) document.renderQueues.delete(index);
  });
  return render;
}
