import OpenSeadragon from 'openseadragon';
import { fetchIiifBytes } from '../../services/iiifViewerService';
import { errorMessage } from '../../utils/logger';

/**
 * Il ponte tra OpenSeadragon e il motore.
 *
 * OpenSeadragon costruisce da solo, dall'`info.json`, l'indirizzo di ogni
 * tassello secondo la Image API (regione, misura, rotazione) — quella parte
 * non va reinventata. Quello che cambia è **come** i byte arrivano:
 * sovrascrivendo `downloadTileStart`/`downloadTileAbort` sull'istanza (un
 * punto di estensione documentato di OpenSeadragon), ogni richiesta passa dal
 * ponte controllato (`fetchIiifBytes`, `kind: "remote"`) invece che da un XHR
 * diretto della finestra — la politica di sicurezza non ammetterebbe comunque
 * un indirizzo remoto arbitrario, e scavalcarla allargandola a tutte le
 * immagini HTTPS aprirebbe la finestra a qualunque server, non solo alle
 * biblioteche conosciute.
 *
 * `info.json` è un oggetto secondo lo standard, letto una volta e passato così
 * com'è: OpenSeadragon lo interpreta da solo (`IIIFTileSource.configure`), i
 * tipi del pacchetto sono più stretti di quanto la libreria accetti davvero a
 * runtime — da qui l'unico punto con un tipo allargato di questo file.
 */
export function createControlledIiifTileSource(
  infoJson: Record<string, unknown>,
  providerKey: string | null,
): OpenSeadragon.TileSource {
  const serviceId = infoJson.id ?? infoJson['@id'];
  const infoUrl = typeof serviceId === 'string' ? `${serviceId.replace(/\/$/, '')}/info.json` : undefined;
  const normalizedInfo = { ...infoJson };
  const context = normalizedInfo['@context'];
  const normalizeContext = (value: unknown) =>
    typeof value === 'string'
      ? value.replace(/^https:\/\/iiif\.io\/api\/image\/([1-3])\/context\.json$/, 'http://iiif.io/api/image/$1/context.json')
      : value;
  if (Array.isArray(context)) normalizedInfo['@context'] = context.map(normalizeContext);
  else normalizedInfo['@context'] = normalizeContext(context);
  // `new IIIFTileSource(rawInfo)` non esegue `configure`: in particolare non
  // ricava la versione dal contesto. Senza questa normalizzazione OSD 6 può
  // costruire URL Image API 2/3 con la sintassi sbagliata, soprattutto per
  // servizi level 0 e richieste a piena risoluzione.
  const configured = OpenSeadragon.IIIFTileSource.prototype.configure(normalizedInfo, infoUrl);
  const options = configured as ConstructorParameters<typeof OpenSeadragon.IIIFTileSource>[0];
  const tileSource = new OpenSeadragon.IIIFTileSource(options);

  tileSource.downloadTileStart = (context) => {
    context.userData.controlledRequestCancelled = false;
    void (async () => {
      try {
        const bytes = await fetchIiifBytes(context.src, providerKey);
        if (context.userData.controlledRequestCancelled) return;
        const image = await decodeImage(bytes);
        if (context.userData.controlledRequestCancelled) return;
        context.finish(image, null, 'image');
      } catch (error) {
        if (context.userData.controlledRequestCancelled) return;
        context.fail(errorMessage(error), null);
      }
    })();
  };
  // Le richieste passano dal ponte invoke, non da un XHR annullabile: un
  // tassello ormai fuori vista arriva comunque, viene solo scartato subito
  // dopo — non c'è modo di interromperlo a metà da qui.
  tileSource.downloadTileAbort = (context) => {
    context.userData.controlledRequestCancelled = true;
  };

  return tileSource;
}

function decodeImage(bytes: Uint8Array): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    const image = new Image();
    image.onload = () => {
      // L'immagine resta decodificata anche dopo il rilascio dell'indirizzo:
      // tenerlo vivo servirebbe solo a esaurire prima il tetto della cache
      // di indirizzi temporanei della finestra.
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('immagine non decodificabile'));
    };
    image.src = url;
  });
}
