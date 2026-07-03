import { describe, expect, it, afterEach } from 'vitest';
import { resetStrayResizeCursor } from './resetStrayResizeCursor';

describe('resetStrayResizeCursor', () => {
  afterEach(() => {
    document.adoptedStyleSheets = [];
  });

  it('removes a stray *, *:hover cursor rule left by react-resizable-panels', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('*, *:hover {cursor: col-resize !important; }');
    document.adoptedStyleSheets = [sheet];

    resetStrayResizeCursor();

    expect(sheet.cssRules.length).toBe(0);
  });

  it('leaves unrelated adopted stylesheets untouched', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.foo { color: red; }');
    document.adoptedStyleSheets = [sheet];

    resetStrayResizeCursor();

    expect(sheet.cssRules.length).toBe(1);
  });

  it('is a no-op when there are no adopted stylesheets', () => {
    document.adoptedStyleSheets = [];
    expect(() => resetStrayResizeCursor()).not.toThrow();
  });
});
