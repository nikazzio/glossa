import { describe, expect, it } from 'vitest';
import { summarizeManifest } from './manifestSummary';

describe('lettura del manifesto', () => {
  it('legge un manifesto della versione 2, con le sue stringhe semplici', () => {
    const summary = summarizeManifest(JSON.stringify({
      '@type': 'sc:Manifest',
      label: 'Forth Bridge illustrations',
      description: 'Fotografie del ponte',
      attribution: 'National Library of Scotland',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      metadata: [
        { label: 'Shelfmark', value: 'Adv.MS.19.2.1' },
        { label: 'Date', value: '1886' },
      ],
      sequences: [{ canvases: [{}, {}, {}] }],
    }));

    expect(summary.title).toBe('Forth Bridge illustrations');
    expect(summary.summary).toBe('Fotografie del ponte');
    expect(summary.pages).toBe(3);
    expect(summary.fields).toEqual([
      { label: 'Shelfmark', value: 'Adv.MS.19.2.1' },
      { label: 'Date', value: '1886' },
    ]);
    expect(summary.rights).toContain('National Library of Scotland');
  });

  it('legge un manifesto della versione 3, con le etichette per lingua', () => {
    const summary = summarizeManifest(JSON.stringify({
      type: 'Manifest',
      label: { it: ['La Divina Commedia'] },
      summary: { en: ['A printed edition'] },
      requiredStatement: { label: { en: ['Attribution'] }, value: { en: ['Biblioteca'] } },
      metadata: [{ label: { en: ['Author'] }, value: { en: ['Dante Alighieri'] } }],
      items: [{ type: 'Canvas' }, { type: 'Canvas' }],
    }));

    expect(summary.title).toBe('La Divina Commedia');
    expect(summary.summary).toBe('A printed edition');
    expect(summary.pages).toBe(2);
    expect(summary.fields).toEqual([{ label: 'Author', value: 'Dante Alighieri' }]);
    expect(summary.rights).toContain('Biblioteca');
  });

  it('toglie il codice HTML che le biblioteche scrivono nei valori', () => {
    const summary = summarizeManifest(JSON.stringify({
      label: 'Opera',
      metadata: [{ label: 'Nota', value: '<a href="x">Vedi</a><br/>seconda riga' }],
    }));

    expect(summary.fields[0].value).toBe('Vedi · seconda riga');
  });

  it('non inventa un conteggio di pagine quando il manifesto non lo dichiara', () => {
    expect(summarizeManifest(JSON.stringify({ label: 'Opera' })).pages).toBeNull();
  });
});
