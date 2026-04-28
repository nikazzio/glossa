export type MarkdownCommand =
  | 'bold'
  | 'italic'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'link'
  | 'footnote'
  | 'unordered-list'
  | 'ordered-list';

export interface MarkdownCommandInput {
  command: MarkdownCommand;
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface MarkdownCommandResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyMarkdownCommand(input: MarkdownCommandInput): MarkdownCommandResult {
  const { command, value, selectionStart, selectionEnd } = input;
  const selected = value.slice(selectionStart, selectionEnd);

  if (command === 'bold') {
    return wrapSelection(value, selectionStart, selectionEnd, '**', '**', 'bold text');
  }
  if (command === 'italic') {
    return wrapSelection(value, selectionStart, selectionEnd, '*', '*', 'italic text');
  }
  if (command === 'link') {
    return wrapSelection(
      value,
      selectionStart,
      selectionEnd,
      '[',
      '](https://example.com)',
      'link text',
    );
  }
  if (command === 'footnote') {
    const nextId = findNextFootnoteId(value);
    const insertion = `${selected || ''}[^${nextId}]\n\n[^${nextId}]: `;
    const nextValue = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`;
    const cursor = selectionStart + insertion.length;
    return {
      value: nextValue,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }
  if (command === 'unordered-list' || command === 'ordered-list') {
    const prefix = command === 'unordered-list' ? '- ' : '1. ';
    return prefixSelectedLines(value, selectionStart, selectionEnd, prefix, command === 'ordered-list');
  }
  return prefixSelectedLines(
    value,
    selectionStart,
    selectionEnd,
    `${headingPrefix(command)} `,
    false,
  );
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  fallbackText: string,
): MarkdownCommandResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const body = selected || fallbackText;
  const replacement = `${before}${body}${after}`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const bodyStart = selectionStart + before.length;
  const bodyEnd = bodyStart + body.length;
  return {
    value: nextValue,
    selectionStart: bodyStart,
    selectionEnd: bodyEnd,
  };
}

function prefixSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  ordered: boolean,
): MarkdownCommandResult {
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const nextBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const selectedBlock = value.slice(lineStart, lineEnd);
  const lines = selectedBlock.split('\n');
  const prefixed = lines
    .map((line, index) => {
      if (!line.trim()) return line;
      if (ordered) return `${index + 1}. ${line.replace(/^\d+\.\s+/, '')}`;
      return `${prefix}${line.replace(/^([#]+\s+|[-+*]\s+|•\s+)/, '')}`;
    })
    .join('\n');
  const nextValue = `${value.slice(0, lineStart)}${prefixed}${value.slice(lineEnd)}`;
  return {
    value: nextValue,
    selectionStart: lineStart,
    selectionEnd: lineStart + prefixed.length,
  };
}

function headingPrefix(command: Extract<MarkdownCommand, 'heading-1' | 'heading-2' | 'heading-3'>): string {
  if (command === 'heading-1') return '#';
  if (command === 'heading-2') return '##';
  return '###';
}

function findNextFootnoteId(value: string): number {
  const matches = Array.from(value.matchAll(/\[\^(\d+)\]/g)).map((match) => Number(match[1]));
  return matches.length > 0 ? Math.max(...matches) + 1 : 1;
}
