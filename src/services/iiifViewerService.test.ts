import { describe, expect, it } from 'vitest';
import {
  pageThumbnailUrl,
  preferredPageWidth,
  readablePageWidth,
  type ViewerPage,
} from './iiifViewerService';

const page = (width: number | null, height: number | null, thumbnail: string | null = null): ViewerPage => ({
  index: 1,
  label: null,
  imageService: 'https://images.example.test/1',
  width,
  height,
  canvasId: null,
  thumbnail,
});

describe('la misura da chiedere alla biblioteca', () => {
  it('chiede un dimezzamento della pagina, non una misura tonda', () => {
    // Le biblioteche tengono pronti i dimezzamenti; qualunque altra misura la
    // costruiscono al momento, e costa dieci volte tanto.
    expect(readablePageWidth(page(4000, 6000), 1600)).toBe(2000);
    expect(readablePageWidth(page(2646, 4112), 1600)).toBe(1323);
  });

  it('non ingrandisce una pagina già più piccola di quella che serve', () => {
    expect(readablePageWidth(page(900, 1200), 1600)).toBe(900);
  });

  it('senza dimensioni dichiarate ripiega sulla misura di lettura', () => {
    expect(readablePageWidth(page(null, null), 1600)).toBe(1600);
  });

  it('preferisce una misura pronta gia presente nell indice del libro', () => {
    const withReadySizes = {
      ...page(4000, 6000),
      readySizes: [[500, 750], [1000, 1500], [2000, 3000]] as Array<[number, number]>,
    };

    expect(preferredPageWidth(withReadySizes, 1600)).toBe(2000);
  });

  it('usa la maggiore misura pronta quando nessuna raggiunge quella necessaria', () => {
    const withReadySizes = {
      ...page(4000, 6000),
      readySizes: [[500, 750], [1000, 1500]] as Array<[number, number]>,
    };

    expect(preferredPageWidth(withReadySizes, 1600)).toBe(1000);
  });

  it('senza misure pronte lascia decidere al dimezzamento', () => {
    expect(preferredPageWidth(page(4000, 6000), 1600)).toBe(2000);
  });

  it('usa la miniatura che la biblioteca dichiara, quando c e', () => {
    expect(pageThumbnailUrl(page(4000, 6000, 'https://images.example.test/thumb.jpg'), 96)).toBe(
      'https://images.example.test/thumb.jpg',
    );
  });

  it('senza miniatura dichiarata ne chiede una di misura già pronta', () => {
    // 96 esatti li costruirebbero al momento; 125 è un dimezzamento, e non
    // scende sotto lo spazio da riempire.
    expect(pageThumbnailUrl(page(4000, 6000), 96)).toBe(
      'https://images.example.test/1/full/125,/0/default.jpg',
    );
  });

  it('senza miniatura dichiarata preferisce una misura pronta nell indice', () => {
    const withReadySizes = {
      ...page(4000, 6000),
      readySizes: [[80, 120], [160, 240]] as Array<[number, number]>,
    };

    expect(pageThumbnailUrl(withReadySizes, 96)).toBe(
      'https://images.example.test/1/full/80,/0/default.jpg',
    );
  });
});
