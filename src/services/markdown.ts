export type MarkdownInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: MarkdownInlineNode[] }
  | { type: 'emphasis'; children: MarkdownInlineNode[] }
  | { type: 'link'; text: string; href: string }
  | { type: 'footnote-ref'; id: string };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: MarkdownInlineNode[] }
  | { type: 'paragraph'; children: MarkdownInlineNode[] }
  | { type: 'list'; ordered: boolean; items: MarkdownInlineNode[][] };

export interface MarkdownFootnote {
  id: string;
  text: string;
}

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  footnotes: MarkdownFootnote[];
}

export function parseMarkdownDocument(markdown: string): MarkdownDocument {
  const normalized = normalizeMarkdown(markdown);
  const lines = normalized.split('\n');
  const bodyLines: string[] = [];
  const footnotes: MarkdownFootnote[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const footnoteMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (!footnoteMatch) {
      bodyLines.push(line);
      continue;
    }

    const continuation: string[] = [footnoteMatch[2].trim()];
    while (index + 1 < lines.length && lines[index + 1].trim()) {
      continuation.push(lines[index + 1].trim());
      index += 1;
    }
    footnotes.push({
      id: footnoteMatch[1],
      text: continuation.join(' ').trim(),
    });
  }

  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < bodyLines.length) {
    const line = bodyLines[index].trimEnd();
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        children: parseInlineMarkdown(headingMatch[2].trim()),
      });
      index += 1;
      continue;
    }

    const listMatch = line.match(/^(([-+*])|(\d+\.))\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[3]);
      const items: MarkdownInlineNode[][] = [];
      while (index < bodyLines.length) {
        const current = bodyLines[index].trim();
        const currentMatch = current.match(/^(([-+*])|(\d+\.))\s+(.+)$/);
        if (!currentMatch || Boolean(currentMatch[3]) !== ordered) break;
        items.push(parseInlineMarkdown(currentMatch[4].trim()));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines = [line.trim()];
    while (index + 1 < bodyLines.length) {
      const next = bodyLines[index + 1].trim();
      if (!next) break;
      if (/^(#{1,3})\s+/.test(next) || /^(([-+*])|(\d+\.))\s+/.test(next)) break;
      paragraphLines.push(next);
      index += 1;
    }

    blocks.push({
      type: 'paragraph',
      children: parseInlineMarkdown(paragraphLines.join(' ')),
    });
    index += 1;
  }

  return { blocks, footnotes };
}

export function renderMarkdownToHtmlFragment(markdown: string): string {
  const document = parseMarkdownDocument(markdown);
  const body = document.blocks.map(renderBlockToHtml).join('\n');
  const footnotes =
    document.footnotes.length > 0
      ? [
          '<section class="footnotes">',
          '<h2>Notes</h2>',
          '<ol>',
          ...document.footnotes.map(
            (footnote) =>
              `<li id="fn-${escapeHtml(footnote.id)}"><p>${renderInlineToHtml(
                parseInlineMarkdown(footnote.text),
              )} <a class="footnote-backref" href="#fnref-${escapeHtml(
                footnote.id,
              )}" aria-label="Back to reference">↩</a></p></li>`,
          ),
          '</ol>',
          '</section>',
        ].join('\n')
      : '';

  return [body, footnotes].filter(Boolean).join('\n');
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
    '    .footnotes { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #cdbda3; }',
    '    .footnotes ol { padding-left: 1.25rem; }',
    '    .footnotes p { margin: 0; }',
    '    .footnote-backref { text-decoration: none; margin-left: 0.35rem; }',
    '  </style>',
    '</head>',
    '<body>',
    `  <main class="glossa-export">${renderMarkdownToHtmlFragment(markdown)}</main>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export function flattenMarkdownToText(markdown: string): string {
  const document = parseMarkdownDocument(markdown);
  const lines: string[] = [];

  document.blocks.forEach((block) => {
    if (block.type === 'heading') {
      lines.push(flattenInline(block.children).toUpperCase(), '');
      return;
    }

    if (block.type === 'paragraph') {
      lines.push(flattenInline(block.children), '');
      return;
    }

    block.items.forEach((item, index) => {
      const prefix = block.ordered ? `${index + 1}. ` : '• ';
      lines.push(`${prefix}${flattenInline(item)}`);
    });
    lines.push('');
  });

  if (document.footnotes.length > 0) {
    lines.push('Notes', '');
    document.footnotes.forEach((footnote) => {
      lines.push(`[${footnote.id}] ${flattenInline(parseInlineMarkdown(footnote.text))}`);
    });
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function markdownToSourceText(markdown: string, markdownAware: boolean): string {
  return markdownAware ? markdown : markdown.trim();
}

function renderBlockToHtml(block: MarkdownBlock): string {
  if (block.type === 'heading') {
    return `<h${block.level}>${renderInlineToHtml(block.children)}</h${block.level}>`;
  }
  if (block.type === 'paragraph') {
    return `<p>${renderInlineToHtml(block.children)}</p>`;
  }
  const tag = block.ordered ? 'ol' : 'ul';
  const items = block.items
    .map((item) => `<li>${renderInlineToHtml(item)}</li>`)
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

function renderInlineToHtml(nodes: MarkdownInlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeHtml(node.value);
      if (node.type === 'strong') return `<strong>${renderInlineToHtml(node.children)}</strong>`;
      if (node.type === 'emphasis') return `<em>${renderInlineToHtml(node.children)}</em>`;
      if (node.type === 'link') {
        return `<a href="${escapeAttribute(node.href)}">${escapeHtml(node.text)}</a>`;
      }
      return `<sup id="fnref-${escapeHtml(node.id)}"><a href="#fn-${escapeHtml(
        node.id,
      )}">${escapeHtml(node.id)}</a></sup>`;
    })
    .join('');
}

function flattenInline(nodes: MarkdownInlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'strong' || node.type === 'emphasis') return flattenInline(node.children);
      if (node.type === 'link') return node.text;
      return `[${node.id}]`;
    })
    .join('');
}

function parseInlineMarkdown(text: string): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = [];
  let index = 0;

  while (index < text.length) {
    const remaining = text.slice(index);

    const footnoteRef = remaining.match(/^\[\^([^\]]+)\]/);
    if (footnoteRef) {
      nodes.push({ type: 'footnote-ref', id: footnoteRef[1] });
      index += footnoteRef[0].length;
      continue;
    }

    const link = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (link) {
      nodes.push({ type: 'link', text: link[1], href: link[2] });
      index += link[0].length;
      continue;
    }

    if (remaining.startsWith('**')) {
      const end = remaining.indexOf('**', 2);
      if (end > 1) {
        nodes.push({
          type: 'strong',
          children: parseInlineMarkdown(remaining.slice(2, end)),
        });
        index += end + 2;
        continue;
      }
    }

    if (remaining.startsWith('*')) {
      const end = remaining.indexOf('*', 1);
      if (end > 0) {
        nodes.push({
          type: 'emphasis',
          children: parseInlineMarkdown(remaining.slice(1, end)),
        });
        index += end + 1;
        continue;
      }
    }

    const nextSpecial = findNextInlineMarker(remaining);
    const value = nextSpecial === -1 ? remaining : remaining.slice(0, nextSpecial);
    nodes.push({ type: 'text', value });
    index += value.length;
  }

  return nodes;
}

function findNextInlineMarker(text: string): number {
  const candidates = ['[^', '[', '**', '*']
    .map((token) => text.indexOf(token))
    .filter((index) => index >= 0);
  return candidates.length > 0 ? Math.min(...candidates) : -1;
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

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
