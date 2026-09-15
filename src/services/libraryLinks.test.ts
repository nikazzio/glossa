import { describe, expect, it } from 'vitest';
import { libraryItemUrl, libraryPageUrl } from './libraryLinks';

const GALLICA = 'https://gallica.bnf.fr/iiif/ark:/12148/btv1b8449691v/manifest.json';
const ARCHIVE = 'https://iiif.archive.org/iiif/ladivinacommedia00dantuoft/manifest.json';

describe('collegamenti al sito della biblioteca', () => {
  it('di Gallica ricava scheda e pagina, che là si contano da uno', () => {
    expect(libraryItemUrl('gallica', GALLICA)).toBe('https://gallica.bnf.fr/ark:/12148/btv1b8449691v');
    expect(libraryPageUrl('gallica', GALLICA, 11)).toBe(
      'https://gallica.bnf.fr/ark:/12148/btv1b8449691v/f12.item',
    );
  });

  it('di Internet Archive ricava scheda e foglio, che là si contano da zero', () => {
    expect(libraryItemUrl('archive_org', ARCHIVE)).toBe(
      'https://archive.org/details/ladivinacommedia00dantuoft',
    );
    expect(libraryPageUrl('archive_org', ARCHIVE, 12)).toBe(
      'https://archive.org/details/ladivinacommedia00dantuoft/page/n12',
    );
  });

  it('non inventa niente per le biblioteche di cui non si conosce la forma', () => {
    expect(libraryItemUrl('vatican', 'https://digi.vatlib.it/iiif/MSS_Urb.lat.1779/manifest.json')).toBeNull();
    expect(libraryPageUrl('vatican', 'https://digi.vatlib.it/iiif/MSS_Urb.lat.1779/manifest.json', 3)).toBeNull();
  });

  it('non costruisce un indirizzo se la biblioteca non corrisponde al manifesto', () => {
    expect(libraryItemUrl('gallica', ARCHIVE)).toBeNull();
    expect(libraryPageUrl('archive_org', GALLICA, 1)).toBeNull();
  });
});
