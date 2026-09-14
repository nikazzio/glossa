/**
 * Dall'indirizzo del manifesto alla pagina pubblica della biblioteca.
 *
 * È il percorso inverso del riconoscimento: lì si parte da quello che scrive
 * l'utente e si arriva al manifesto, qui si parte dal manifesto e si torna al
 * sito, per riaprire **questa** opera — o **questa** pagina — dove la
 * biblioteca la mostra ai suoi lettori.
 *
 * Solo dove la forma è stata verificata sul servizio vero: un indirizzo
 * costruito per analogia manda su una pagina che non esiste, che è peggio di
 * un comando assente.
 */

/** La scheda dell'opera sul sito della biblioteca. */
export function libraryItemUrl(providerKey: string | null, manifestUrl: string): string | null {
  const gallica = gallicaArk(manifestUrl);
  if (providerKey === 'gallica' && gallica) return `https://gallica.bnf.fr/ark:/${gallica}`;

  const archive = archiveIdentifier(manifestUrl);
  if (providerKey === 'archive_org' && archive) return `https://archive.org/details/${archive}`;

  return null;
}

/**
 * Il visore della biblioteca aperto sulla pagina che si sta guardando.
 *
 * `pageIndex` conta da zero, come nel visore di Glossa. Gallica numera le
 * pagine da uno (`f12.item`), Internet Archive conta i fogli da zero
 * (`/page/n12`): la differenza sta qui e non nel chiamante.
 */
export function libraryPageUrl(
  providerKey: string | null,
  manifestUrl: string,
  pageIndex: number,
): string | null {
  if (pageIndex < 0) return null;

  const gallica = gallicaArk(manifestUrl);
  if (providerKey === 'gallica' && gallica) {
    return `https://gallica.bnf.fr/ark:/${gallica}/f${pageIndex + 1}.item`;
  }

  const archive = archiveIdentifier(manifestUrl);
  if (providerKey === 'archive_org' && archive) {
    return `https://archive.org/details/${archive}/page/n${pageIndex}`;
  }

  return null;
}

/** `https://gallica.bnf.fr/iiif/ark:/12148/btv1b8449691v/manifest.json` → `12148/btv1b8449691v`. */
function gallicaArk(manifestUrl: string): string | null {
  const match = /gallica\.bnf\.fr\/iiif\/ark:\/(\d+)\/([^/]+)\//.exec(manifestUrl);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** `https://iiif.archive.org/iiif/<id>/manifest.json`, anche nella forma con la versione. */
function archiveIdentifier(manifestUrl: string): string | null {
  const match = /iiif\.archive(?:lab)?\.org\/iiif\/(?:\d+\/)?([^/]+)\/manifest/.exec(manifestUrl);
  return match ? match[1] : null;
}
