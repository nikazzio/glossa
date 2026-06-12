import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

// Footnotes are rendered via GFM (`[^id]` inline + `[^id]: text` definitions).
// remark-gfm builds the inline `<sup>` references and the trailing
// `<section data-footnotes>` list with backrefs automatically, so source and
// translation panes render identically as long as they feed the same markdown.

// Allow the footnote markup (ids, classes, data-* flags) through the sanitizer.
// The default schema already strips unsafe link protocols (javascript:, data:, …).
const sanitizeSchema = {
  ...defaultSchema,
  // remark-rehype already namespaces footnote ids/hrefs with `user-content-`.
  // Disable the sanitizer's own id clobbering so it does not double-prefix the
  // id while leaving the matching href untouched (which would break anchors).
  clobber: [],
  tagNames: [...(defaultSchema.tagNames ?? []), 'section', 'sup'],
  attributes: {
    ...defaultSchema.attributes,
    section: [...(defaultSchema.attributes?.section ?? []), 'className', 'dataFootnotes'],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      'id',
      'className',
      'ariaDescribedby',
      'dataFootnoteRef',
      'dataFootnoteBackref',
    ],
    li: [...(defaultSchema.attributes?.li ?? []), 'id', 'value'],
    sup: [...(defaultSchema.attributes?.sup ?? []), 'id'],
    ol: [...(defaultSchema.attributes?.ol ?? []), 'className'],
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id', 'className'],
  },
};

const htmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

const mdastProcessor = unified().use(remarkParse).use(remarkGfm);

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  identifier?: string;
  ordered?: boolean;
}

interface RenderOptions {
  /**
   * Strip footnote navigation anchors (inline ref href + `↩` backrefs). Used by
   * the in-app preview, where the scroll-jump shifted the document pane
   * horizontally. Standalone HTML export keeps the working links (default).
   */
  stripFootnoteNav?: boolean;
}

export function renderMarkdownToHtmlFragment(markdown: string, options: RenderOptions = {}): string {
  const html = String(htmlProcessor.processSync(normalizeMarkdown(markdown)));
  const stripped = options.stripFootnoteNav ? stripFootnoteNavigation(html) : html;
  return restoreFootnoteDisplayNumbers(stripped);
}

/**
 * remark-gfm always numbers footnote references sequentially (1, 2, 3…)
 * regardless of the GFM label. When source-pane previews use label "22" for
 * the 22nd document-level note, GFM still renders it as "2" (if it is the
 * second reference in the chunk). This function reads the label back from the
 * `id` attribute and writes it as the visible counter, both in the inline
 * superscript and in the footnote-section list items.
 *
 * No-op when labels are sequential (1, 2, 3…), so translation previews and
 * exports are unaffected.
 */
function restoreFootnoteDisplayNumbers(html: string): string {
  // Inline refs: <sup><a id="user-content-fnref-22" ...>2</a></sup>
  // The id is on the <a>, not the <sup>. Replace the inner text with the label.
  let result = html.replace(
    /(<a\b[^>]*\bid="user-content-fnref-([^"]+)"[^>]*>)\d+(<\/a>)/g,
    (_full, pre, label, post) => `${pre}${label}${post}`,
  );
  // Footnote section <li>: add value="22" so the <ol> counter shows the right number.
  result = result.replace(
    /<li id="(user-content-fn-(\d+))"/g,
    '<li id="$1" value="$2"',
  );
  return result;
}

/**
 * Removes footnote navigation anchors from rendered GFM output:
 * - drops the `↩` backref links in the footnote section entirely;
 * - strips the `href` from inline footnote references so clicking them no
 *   longer scroll-jumps (which shifted the document pane horizontally).
 * The reference number stays visible and styled; it is just inert.
 */
function stripFootnoteNavigation(html: string): string {
  return html
    .replace(/<a\b[^>]*\bdata-footnote-backref\b[^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<a\b[^>]*\bdata-footnote-ref\b[^>]*>/g, (tag) => tag.replace(/\shref="[^"]*"/, ''));
}

export function buildMarkdownHtmlDocument(markdown: string, title = 'Glossa Export'): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>',
    '    :root { color-scheme: light; }',
    '    body { margin: 0; background: #f3efe6; color: #241c15; font-family: Georgia, "Times New Roman", serif; }',
    '    .glossa-export { max-width: 760px; margin: 0 auto; padding: 56px 24px 72px; line-height: 1.75; }',
    '    h1, h2, h3 { font-family: "Iowan Old Style", Georgia, serif; line-height: 1.2; margin: 2rem 0 1rem; }',
    '    h1 { font-size: 2.3rem; }',
    '    h2 { font-size: 1.7rem; }',
    '    h3 { font-size: 1.35rem; }',
    '    p, ul, ol { margin: 0 0 1rem; }',
    '    ul, ol { padding-left: 1.5rem; }',
    '    a { color: #744c18; }',
    '    sup { font-size: 0.75em; }',
    '    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }',
    '    .footnotes { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #cdbda3; font-size: 0.9rem; }',
    '    .footnotes ol { padding-left: 1.25rem; }',
    '    .footnotes p { margin: 0; }',
    '    .data-footnote-backref, [data-footnote-backref] { text-decoration: none; margin-left: 0.35rem; }',
    '    table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; }',
    '    th, td { border: 1px solid #cdbda3; padding: 0.4rem 0.75rem; text-align: left; }',
    '    thead { background: #ede8df; }',
    '  </style>',
    '</head>',
    '<body>',
    `  <main class="glossa-export">${renderMarkdownToHtmlFragment(markdown)}</main>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export function flattenMarkdownToText(markdown: string): string {
  const tree = mdastProcessor.parse(normalizeMarkdown(markdown)) as MdNode;

  const numberById = new Map<string, number>();
  const assignNumber = (id: string): number => {
    const existing = numberById.get(id);
    if (existing !== undefined) return existing;
    const next = numberById.size + 1;
    numberById.set(id, next);
    return next;
  };

  const inlineText = (node: MdNode): string => {
    if (node.type === 'footnoteReference') return `[${assignNumber(node.identifier ?? '')}]`;
    if (node.type === 'break') return ' ';
    if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
    if (node.children) return node.children.map(inlineText).join('');
    return node.value ?? '';
  };

  const lines: string[] = [];
  const definitions: MdNode[] = [];

  for (const node of tree.children ?? []) {
    switch (node.type) {
      case 'footnoteDefinition':
        definitions.push(node);
        break;
      case 'heading':
        lines.push(inlineText(node).toUpperCase(), '');
        break;
      case 'paragraph':
      case 'blockquote':
        lines.push(inlineText(node).trim(), '');
        break;
      case 'list': {
        const ordered = node.ordered === true;
        (node.children ?? []).forEach((item, index) => {
          const prefix = ordered ? `${index + 1}. ` : '• ';
          lines.push(`${prefix}${inlineText(item).trim()}`);
        });
        lines.push('');
        break;
      }
      case 'table':
        (node.children ?? []).forEach((row) => {
          lines.push((row.children ?? []).map(inlineText).join(' | '));
        });
        lines.push('');
        break;
      case 'thematicBreak':
        break;
      default:
        if (node.children) lines.push(inlineText(node).trim(), '');
    }
  }

  if (definitions.length > 0) {
    lines.push('Notes', '');
    definitions
      .slice()
      .sort(
        (a, b) =>
          (numberById.get(a.identifier ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (numberById.get(b.identifier ?? '') ?? Number.MAX_SAFE_INTEGER),
      )
      .forEach((definition) => {
        const number = assignNumber(definition.identifier ?? '');
        lines.push(`[${number}] ${inlineText(definition).trim()}`);
      });
    lines.push('');
  }

  return lines.join('\n').trim();
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
