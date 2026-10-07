import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDITORIAL_ACCENT_DARK, EDITORIAL_ACCENT_LIGHT, EDITORIAL_BG, HL_COLORS_LIGHT } from './stores/uiStore';

// Il foglio di stile è la fonte dei colori. Alcuni servono anche nel codice
// (accento modificabile, controllo del contrasto, evidenziazioni): qui si
// controlla che le due copie non si separino.
const css = readFileSync('src/index.css', 'utf8');
const lightTheme = css.slice(css.indexOf('@theme {'), css.indexOf('html.dark {'));
const darkTheme = css.slice(css.indexOf('html.dark {'));
const rootBlock = css.slice(css.indexOf(':root {'));

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} non trovato`);
  return match[1].trim().toLowerCase();
}

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();

describe('theme colours defined in both stylesheet and code', () => {
  it('keeps the accent defaults equal to the stylesheet', () => {
    expect(token(lightTheme, '--color-editorial-accent')).toBe(EDITORIAL_ACCENT_LIGHT.toLowerCase());
    expect(token(darkTheme, '--color-editorial-accent')).toBe(EDITORIAL_ACCENT_DARK.toLowerCase());
  });

  it('checks the accent contrast against the real page background', () => {
    expect(token(lightTheme, '--color-editorial-bg')).toBe(EDITORIAL_BG.light.toLowerCase());
    expect(token(darkTheme, '--color-editorial-bg')).toBe(EDITORIAL_BG.dark.toLowerCase());
  });

  it('starts the highlights with the same colours the app applies', () => {
    expect(normalize(token(rootBlock, '--hl-annot-bg'))).toBe(normalize(HL_COLORS_LIGHT.annotation));
    expect(normalize(token(rootBlock, '--hl-match-bg'))).toBe(normalize(HL_COLORS_LIGHT.matchTerm));
  });

  it('gives a dark value to the text drawn on ink', () => {
    expect(token(lightTheme, '--color-on-ink')).not.toBe(token(darkTheme, '--color-on-ink'));
  });
});
