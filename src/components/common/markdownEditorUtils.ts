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
    return toggleInlineWrap(value, selectionStart, selectionEnd, '**', '**', 'bold text');
  }
  if (command === 'italic') {
    return toggleInlineWrap(value, selectionStart, selectionEnd, '*', '*', 'italic text');
  }
  if (command === 'link') {
    return insertOrWrapLink(
      value,
      selectionStart,
      selectionEnd,
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
    return toggleBlockPrefix(
      value,
      selectionStart,
      selectionEnd,
      command === 'unordered-list' ? '- ' : '1. ',
      command === 'ordered-list',
    );
  }
  return toggleHeading(
    value,
    selectionStart,
    selectionEnd,
    headingPrefix(command),
  );
}

function toggleInlineWrap(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  fallbackText: string,
): MarkdownCommandResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const fullMatch =
    selectionStart >= before.length && selectionEnd + after.length <= value.length
      ? value.slice(selectionStart - before.length, selectionEnd + after.length)
      : '';
  if (selected && fullMatch === `${before}${selected}${after}`) {
    const nextValue = `${value.slice(0, selectionStart - before.length)}${selected}${value.slice(selectionEnd + after.length)}`;
    const nextStart = selectionStart - before.length;
    const nextEnd = nextStart + selected.length;
    return {
      value: nextValue,
      selectionStart: nextStart,
      selectionEnd: nextEnd,
    };
  }
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

function insertOrWrapLink(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  fallbackText: string,
): MarkdownCommandResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const linkMatch = selected.match(/^\[([^\]]+)\]\([^)]+\)$/);
  if (linkMatch) {
    const plainText = linkMatch[1];
    return {
      value: `${value.slice(0, selectionStart)}${plainText}${value.slice(selectionEnd)}`,
      selectionStart,
      selectionEnd: selectionStart + plainText.length,
    };
  }

  const body = selected || fallbackText;
  const replacement = `[${body}](https://example.com)`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const bodyStart = selectionStart + 1;
  const bodyEnd = bodyStart + body.length;
  return {
    value: nextValue,
    selectionStart: bodyStart,
    selectionEnd: bodyEnd,
  };
}

function toggleHeading(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
): MarkdownCommandResult {
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const nextBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const selectedBlock = value.slice(lineStart, lineEnd);
  const headingPattern = new RegExp(`^${escapeRegExp(prefix)}\\s+`);
  const line = selectedBlock.trim();
  const replacement = headingPattern.test(line)
    ? line.replace(headingPattern, '')
    : `${prefix} ${line.replace(/^#{1,3}\s+/, '')}`;
  const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
  return {
    value: nextValue,
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length,
  };
}

function toggleBlockPrefix(
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
  const isAlreadyPrefixed = lines.every((line) => !line.trim() || (ordered ? /^\d+\.\s+/.test(line) : new RegExp(`^${escapeRegExp(prefix)}`).test(line)));
  const transformed = lines
    .map((line, index) => {
      if (!line.trim()) return line;
      if (isAlreadyPrefixed) {
        return ordered
          ? line.replace(/^\d+\.\s+/, '')
          : line.replace(new RegExp(`^${escapeRegExp(prefix)}`), '');
      }
      return ordered
        ? `${index + 1}. ${line.replace(/^\d+\.\s+/, '')}`
        : `${prefix}${line.replace(/^[-+*]\s+/, '')}`;
    })
    .join('\n');

  return {
    value: `${value.slice(0, lineStart)}${transformed}${value.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
