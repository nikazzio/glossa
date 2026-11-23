import { Bold, Eye, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, MessageSquarePlus, Minus, Pencil, Plus, Type } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClickPopover, CopyButton, IconButton, Tooltip } from '../ui';
import { applyMarkdownCommand, type MarkdownCommand } from '../common/markdownEditorUtils';
import { buildHighlightLayerHtml, renderMarkdownWithHighlights, type PassageHighlight } from './passageHighlights';

export type PageEditorMode = 'write' | 'read';

export interface TextSelection {
  start: number;
  end: number;
}

const TEXT_SIZES = [
  { fontSize: '0.8125rem', lineHeight: '1.625rem' },
  { fontSize: '0.9375rem', lineHeight: '1.875rem' },
  { fontSize: '1.0625rem', lineHeight: '2.125rem' },
  { fontSize: '1.25rem', lineHeight: '2.5rem' },
] as const;
const DEFAULT_TEXT_SIZE = 1;

const FORMAT_COMMANDS: ReadonlyArray<{ command: MarkdownCommand; icon: typeof Bold; labelKey: string }> = [
  { command: 'bold', icon: Bold, labelKey: 'editor.bold' },
  { command: 'italic', icon: Italic, labelKey: 'editor.italic' },
  { command: 'link', icon: Link2, labelKey: 'editor.link' },
  { command: 'heading-1', icon: Heading1, labelKey: 'editor.heading1' },
  { command: 'heading-2', icon: Heading2, labelKey: 'editor.heading2' },
  { command: 'heading-3', icon: Heading3, labelKey: 'editor.heading3' },
  { command: 'unordered-list', icon: List, labelKey: 'editor.unorderedList' },
  { command: 'ordered-list', icon: ListOrdered, labelKey: 'editor.orderedList' },
];

interface PageEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Cambia con la pagina: azzera scorrimento e selezione. */
  identityKey: string;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Senza margine di comandi né modalità Leggi: per il testo di una nota. */
  compact?: boolean;
  highlights?: readonly PassageHighlight[];
  onHighlightClick?: (id: string) => void;
  onSelectionChange?: (selection: TextSelection) => void;
  /** Crea una nota sul testo selezionato (comando nel margine e Ctrl/⌘+Alt+N). */
  onCreateNote?: (selection: TextSelection) => void;
  /** Porta in vista e seleziona il passaggio di una nota. */
  focusRequest?: { highlightId: string; requestId: number } | null;
}

/**
 * L'editor della pagina di trascrizione: textarea nativa (annulla, incolla e
 * correttore del sistema) sopra uno strato con gli stessi caratteri, dove i
 * passaggi annotati sono evidenziati. Due modalità, Scrivi e Leggi; i comandi
 * stanno in colonna nel margine destro della pagina.
 */
function markOf(container: HTMLElement | null, id: string): HTMLElement | null {
  const marks = container?.querySelectorAll<HTMLElement>('mark[data-note-id]') ?? [];
  return Array.from(marks).find((mark) => mark.dataset.noteId === id) ?? null;
}

export function PageEditor({
  value,
  onChange,
  identityKey,
  readOnly = false,
  placeholder,
  ariaLabel,
  compact = false,
  highlights = [],
  onHighlightClick,
  onSelectionChange,
  onCreateNote,
  focusRequest = null,
}: PageEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const readRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<PageEditorMode>('write');
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [formatOpen, setFormatOpen] = useState(false);
  const [hovered, setHovered] = useState<{ label: string; rect: { left: number; top: number; width: number; height: number } } | null>(null);
  const style = TEXT_SIZES[textSize];
  const reading = mode === 'read' && !compact;

  const layerHtml = useMemo(() => buildHighlightLayerHtml(value, highlights), [value, highlights]);
  const readHtml = useMemo(() => (reading ? renderMarkdownWithHighlights(value, highlights) : ''), [reading, value, highlights]);

  const updateSelection = (start: number, end: number) => {
    setSelection((current) => (current.start === start && current.end === end ? current : { start, end }));
  };
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  useEffect(() => {
    const element = textareaRef.current;
    if (element) {
      element.scrollTop = 0;
      element.setSelectionRange(0, 0);
    }
    if (readRef.current) readRef.current.scrollTop = 0;
    setSelection({ start: 0, end: 0 });
  }, [identityKey]);

  const syncLayer = () => {
    if (layerRef.current && textareaRef.current) layerRef.current.scrollTop = textareaRef.current.scrollTop;
  };
  // Lo strato si riscrive a ogni modifica e il browser ne azzera lo
  // scorrimento: si riallinea prima che il frame venga disegnato.
  useLayoutEffect(syncLayer, [layerHtml]);

  useEffect(() => {
    if (!focusRequest) return;
    const target = highlights.find((highlight) => highlight.id === focusRequest.highlightId);
    if (!target) return;
    if (reading) {
      markOf(readRef.current, target.id)?.scrollIntoView({ block: 'center' });
      return;
    }
    const element = textareaRef.current;
    const mark = markOf(layerRef.current, target.id);
    if (!element) return;
    element.focus();
    element.setSelectionRange(target.start, target.end);
    updateSelection(target.start, target.end);
    if (mark) element.scrollTop = Math.max(0, mark.offsetTop - element.clientHeight / 3);
    syncLayer();
    // Solo su una richiesta nuova: scrivere non deve riportare la vista lì.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.requestId]);

  /** Sostituisce il testo come una digitazione: l'annulla del sistema resta valido. */
  const replaceText = (next: string, selectionStart: number, selectionEnd: number) => {
    const element = textareaRef.current;
    if (!element) return;
    let prefix = 0;
    while (prefix < value.length && prefix < next.length && value[prefix] === next[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < value.length - prefix && suffix < next.length - prefix &&
      value[value.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) suffix += 1;
    element.focus();
    element.setSelectionRange(prefix, value.length - suffix);
    const inserted = typeof document.execCommand === 'function'
      && document.execCommand('insertText', false, next.slice(prefix, next.length - suffix));
    if (!inserted) onChange(next);
    requestAnimationFrame(() => {
      element.setSelectionRange(selectionStart, selectionEnd);
      updateSelection(selectionStart, selectionEnd);
    });
  };

  const applyCommand = (command: MarkdownCommand) => {
    const element = textareaRef.current;
    if (!element || readOnly) return;
    const result = applyMarkdownCommand({ command, value, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd });
    replaceText(result.value, result.selectionStart, result.selectionEnd);
  };

  const hasSelection = selection.end > selection.start && value.slice(selection.start, selection.end).trim() !== '';
  const createNote = () => {
    if (onCreateNote && hasSelection) onCreateNote(selection);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.code === 'KeyN' && event.altKey && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      createNote();
    }
  };

  const syncSelection = () => {
    const element = textareaRef.current;
    if (element) updateSelection(element.selectionStart, element.selectionEnd);
  };

  const highlightAt = (position: number) =>
    highlights.find((highlight) => position >= highlight.start && position < highlight.end) ?? null;

  const handleClick = () => {
    syncSelection();
    const element = textareaRef.current;
    if (!element || element.selectionStart !== element.selectionEnd) return;
    const hit = highlightAt(element.selectionStart);
    if (hit) onHighlightClick?.(hit.id);
  };

  // La textarea copre lo strato: il passaggio sotto il puntatore si trova
  // confrontando la posizione con i rettangoli dei `<mark>`.
  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const container = event.currentTarget.getBoundingClientRect();
    const marks = layerRef.current?.querySelectorAll<HTMLElement>('mark[data-note-id]') ?? [];
    for (const mark of marks) {
      for (const rect of mark.getClientRects()) {
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
          const label = highlights.find((highlight) => highlight.id === mark.dataset.noteId)?.label ?? '';
          setHovered({ label, rect: { left: rect.left - container.left, top: rect.top - container.top, width: rect.width, height: rect.height } });
          return;
        }
      }
    }
    if (hovered) setHovered(null);
  };

  const handleReadClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const mark = (event.target as HTMLElement).closest<HTMLElement>('mark[data-note-id]');
    if (mark?.dataset.noteId) onHighlightClick?.(mark.dataset.noteId);
  };

  const textClassName = 'doc-content text-editorial-ink whitespace-pre-wrap break-words';

  const writeArea = (
    <div className="relative min-h-0 flex-1" onMouseMove={compact ? undefined : handleMouseMove} onMouseLeave={() => setHovered(null)}>
      <div
        ref={layerRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 select-none overflow-y-scroll overlay-scrollbar ${textClassName}`}
        style={style}
        dangerouslySetInnerHTML={{ __html: layerHtml }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onKeyUp={syncSelection}
        onSelect={syncSelection}
        onScroll={syncLayer}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className={`absolute inset-0 h-full w-full resize-none overflow-y-scroll bg-transparent outline-none custom-scrollbar ${textClassName} read-only:cursor-default`}
        style={{ ...style, color: 'transparent', caretColor: 'var(--color-editorial-ink)' }}
      />
      {hovered && hovered.label ? (
        <Tooltip label={hovered.label} open>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{ left: hovered.rect.left, top: hovered.rect.top, width: hovered.rect.width, height: hovered.rect.height }}
          />
        </Tooltip>
      ) : null}
    </div>
  );

  if (compact) {
    return <div className="relative flex min-h-24 flex-col">{writeArea}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {reading ? (
        // Il clic su un passaggio è una scorciatoia del mouse: da tastiera la
        // stessa nota si apre dalla scheda Note («trova nel testo»).
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          ref={readRef}
          className="min-h-0 flex-1 overflow-y-auto custom-scrollbar doc-content text-editorial-ink"
          style={style}
          onClick={handleReadClick}
        >
          {value.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: readHtml }} />
          ) : (
            <p className="text-editorial-muted">{t('pageEditor.readEmpty')}</p>
          )}
        </div>
      ) : (
        writeArea
      )}

      <div className="flex shrink-0 flex-col items-center gap-1.5" role="toolbar" aria-label={t('pageEditor.commands')} aria-orientation="vertical">
        <IconButton size="xs" tone={mode === 'write' ? 'accent' : 'default'} ariaPressed={mode === 'write'} onClick={() => setMode('write')} title={t('pageEditor.write')} tooltipSide="left">
          <Pencil size={13} />
        </IconButton>
        <IconButton size="xs" tone={mode === 'read' ? 'accent' : 'default'} ariaPressed={mode === 'read'} onClick={() => setMode('read')} title={t('pageEditor.read')} tooltipSide="left">
          <Eye size={13} />
        </IconButton>
        <span className="my-1 h-px w-4 bg-rule" aria-hidden="true" />
        {onCreateNote ? (
          <IconButton
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={createNote}
            disabled={reading || !hasSelection}
            title={hasSelection ? t('pageEditor.addNote') : t('pageEditor.addNoteNeedsSelection')}
            tooltipSide="left"
          >
            <MessageSquarePlus size={13} />
          </IconButton>
        ) : null}
        <ClickPopover
          open={formatOpen}
          onOpenChange={setFormatOpen}
          side="left"
          align="start"
          trigger={
            <IconButton size="xs" tone={formatOpen ? 'accent' : 'default'} ariaPressed={formatOpen} title={t('pageEditor.format')} tooltipSide="left">
              <Type size={13} />
            </IconButton>
          }
        >
          <div className="flex flex-col gap-2 p-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('editor.inlineLabel')}>
              {FORMAT_COMMANDS.map(({ command, icon: Icon, labelKey }) => (
                <IconButton
                  key={command}
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCommand(command)}
                  disabled={readOnly || reading}
                  title={t(labelKey)}
                  tooltipSide="bottom"
                >
                  <Icon size={14} />
                </IconButton>
              ))}
            </div>
            <div className="flex gap-1 border-t border-rule pt-2" role="group" aria-label={t('editor.textSize')}>
              <IconButton size="sm" onClick={() => setTextSize((size) => Math.max(0, size - 1))} disabled={textSize === 0} title={t('editor.textSmall')} tooltipSide="bottom">
                <Minus size={14} />
              </IconButton>
              <IconButton size="sm" tone={textSize === DEFAULT_TEXT_SIZE ? 'accent' : 'default'} onClick={() => setTextSize(DEFAULT_TEXT_SIZE)} title={t('editor.textMedium')} tooltipSide="bottom">
                <Type size={14} />
              </IconButton>
              <IconButton size="sm" onClick={() => setTextSize((size) => Math.min(TEXT_SIZES.length - 1, size + 1))} disabled={textSize === TEXT_SIZES.length - 1} title={t('editor.textLarge')} tooltipSide="bottom">
                <Plus size={14} />
              </IconButton>
            </div>
          </div>
        </ClickPopover>
        <CopyButton text={value} size="xs" />
      </div>
    </div>
  );
}
