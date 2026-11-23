import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { escapeHtml } from '../../hooks/useGlossaryHighlight';

/** Un passaggio evidenziato nel testo della pagina: intervallo nel testo
 *  sorgente e suggerimento da mostrare al passaggio del mouse. */
export interface PassageHighlight {
  id: string;
  start: number;
  end: number;
  label: string;
}

/** In ordine di testo, senza intervalli vuoti né sovrapposti (vince il primo). */
function orderedHighlights(text: string, highlights: readonly PassageHighlight[]): PassageHighlight[] {
  const sorted = highlights
    .filter((highlight) => highlight.start < highlight.end && highlight.end <= text.length)
    .slice()
    .sort((a, b) => a.start - b.start);
  return sorted.reduce<PassageHighlight[]>((kept, highlight) => {
    const previous = kept[kept.length - 1];
    return previous && highlight.start < previous.end ? kept : [...kept, highlight];
  }, []);
}

function markOpen(highlight: PassageHighlight): string {
  return `<mark class="hl-annot" data-note-id="${escapeHtml(highlight.id)}">`;
}

/**
 * Lo strato colorato dietro la textarea in modalità Scrivi: lo stesso testo,
 * carattere per carattere, con i passaggi annotati avvolti in `<mark>`.
 */
export function buildHighlightLayerHtml(text: string, highlights: readonly PassageHighlight[]): string {
  let html = '';
  let cursor = 0;
  for (const highlight of orderedHighlights(text, highlights)) {
    html += escapeHtml(text.slice(cursor, highlight.start));
    html += `${markOpen(highlight)}${escapeHtml(text.slice(highlight.start, highlight.end))}</mark>`;
    cursor = highlight.end;
  }
  html += escapeHtml(text.slice(cursor));
  // Un a capo finale non occupa una riga in un div: senza un carattere dopo,
  // lo strato è più corto della textarea e le righe si disallineano.
  return text.endsWith('\n') ? `${html}\u200b` : html;
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/**
 * Divide i nodi di testo del Markdown alle estremità dei passaggi e avvolge
 * i pezzi interni in `<mark>`. Usa le posizioni dei nodi nel sorgente; un
 * nodo il cui testo non coincide con il sorgente (entità, caratteri di
 * escape) resta com'è: meglio un passaggio non evidenziato che uno storto.
 */
function remarkPassageMarks(options: { source: string; highlights: PassageHighlight[] }) {
  const { source, highlights } = options;
  const split = (node: MdNode): MdNode[] => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined || source.slice(start, end) !== node.value) return [node];
    const inside = highlights.filter((highlight) => highlight.start < end && highlight.end > start);
    if (inside.length === 0) return [node];
    const pieces: MdNode[] = [];
    let cursor = start;
    for (const highlight of inside) {
      const from = Math.max(highlight.start, start);
      const to = Math.min(highlight.end, end);
      if (from > cursor) pieces.push({ type: 'text', value: source.slice(cursor, from) });
      pieces.push({
        type: 'passageMark',
        data: { hName: 'mark', hProperties: { className: ['hl-annot'], dataNoteId: highlight.id, dataTooltip: highlight.label } },
        children: [{ type: 'text', value: source.slice(from, to) }],
      });
      cursor = to;
    }
    if (cursor < end) pieces.push({ type: 'text', value: source.slice(cursor, end) });
    return pieces;
  };
  const walk = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => (child.type === 'text' ? split(child) : (walk(child), [child])));
  };
  return (tree: MdNode) => walk(tree);
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
  attributes: {
    ...defaultSchema.attributes,
    mark: ['className', 'dataNoteId', 'dataTooltip'],
  },
};

/** La resa della modalità Leggi, con i passaggi annotati evidenziati. */
export function renderMarkdownWithHighlights(text: string, highlights: readonly PassageHighlight[]): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkPassageMarks, { source: text, highlights: orderedHighlights(text, highlights) })
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);
  return String(processor.processSync(text));
}
