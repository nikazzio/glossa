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
 * che pdf.js decodifica solo con questi moduli WASM — senza, non prova
 * nemmeno a cercarli sulla rete: cade su un ripiego JS che qui non risolve
 * (`wasmUrl` non è impostato), e la pagina non ha niente da disegnare. Copiati
 * in `public/pdfjs/` invece che importati con `?url`: quel percorso li
 * comprimerebbe ognuno con un nome diverso, e pdf.js li cerca con questi nomi
 * esatti in una sola cartella.
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
    destroy: () => task.destroy(),
  };
}

/** Disegna una pagina e ne restituisce l'immagine. */
export async function renderDocumentPage(
  document: LoadedDocument,
  index: number,
): Promise<Blob> {
  // pdf.js conta le pagine da uno; qui, come nel resto del visore, da zero.
  const page = await document.handle.getPage(index + 1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('page_not_drawn');
  // Niente `page.cleanup()` qui: in sviluppo React (StrictMode) chiama questa
  // funzione due volte di seguito per la stessa pagina — la prima chiamata
  // liberava la cache interna di pdf.js mentre la seconda stava ancora
  // disegnando sulla stessa `page`, e il risultato mostrato restava vuoto
  // pur senza errori. `document.destroy()`, già chiamato smontando il
  // visore, libera comunque tutte le pagine quando il documento cambia.
  return blob;
}
