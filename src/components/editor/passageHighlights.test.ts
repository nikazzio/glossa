import { describe, expect, it } from 'vitest';
import { buildHighlightLayerHtml, renderMarkdownWithHighlights, type PassageHighlight } from './passageHighlights';

const at = (text: string, passage: string, id = 'n1', from = 0): PassageHighlight => {
  const start = text.indexOf(passage, from);
  return { id, start, end: start + passage.length, label: 'Dubbio — lettura incerta' };
};

describe('evidenziazione dei passaggi annotati', () => {
  it('nello strato di scrittura avvolge il passaggio e lascia il resto del testo identico', () => {
    const text = 'Et dixit <dominus>';
    const html = buildHighlightLayerHtml(text, [at(text, 'dixit')]);
    expect(html).toBe('Et <mark class="hl-annot" data-note-id="n1">dixit</mark> &lt;dominus&gt;');
  });

  it('evidenzia la ripetizione giusta di una parola ripetuta', () => {
    const text = 'dominus et dominus';
    const html = buildHighlightLayerHtml(text, [at(text, 'dominus', 'n2', 1)]);
    expect(html).toBe('dominus et <mark class="hl-annot" data-note-id="n2">dominus</mark>');
  });

  it('ignora un passaggio sovrapposto a uno già evidenziato', () => {
    const text = 'et dixit dominus';
    const html = buildHighlightLayerHtml(text, [at(text, 'et dixit', 'a'), at(text, 'dixit dominus', 'b')]);
    expect(html).toContain('data-note-id="a"');
    expect(html).not.toContain('data-note-id="b"');
  });

  it('nella lettura evidenzia il passaggio con il suggerimento', () => {
    const text = 'Et dixit dominus';
    const html = renderMarkdownWithHighlights(text, [at(text, 'dixit')]);
    expect(html).toContain('<mark class="hl-annot" data-note-id="n1" data-tooltip="Dubbio — lettura incerta">dixit</mark>');
  });

  it('nella lettura evidenzia anche un passaggio dentro un corsivo', () => {
    const text = 'Et *dixit dominus* ad eum';
    const html = renderMarkdownWithHighlights(text, [at(text, 'dominus')]);
    expect(html).toContain('<em>dixit <mark class="hl-annot" data-note-id="n1"');
    expect(html).toContain('>dominus</mark></em>');
  });

  it('nella lettura un passaggio a cavallo del corsivo evidenzia entrambe le parti', () => {
    const text = 'Et *dixit* dominus';
    const html = renderMarkdownWithHighlights(text, [{ ...at(text, 'dixit* dominus'), id: 'n3' }]);
    expect(html.match(/data-note-id="n3"/g)).toHaveLength(2);
  });
});
