import { Bold, CircleHelp, Columns2, Eye, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, PanelTopClose, PanelTopOpen, Pencil, Pilcrow, Plus, Type } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { renderMarkdownToHtmlFragment } from '../../services/markdown';
import {
  applyMarkdownCommand,
  getActiveMarkdownCommands,
  type MarkdownCommand,
} from './markdownEditorUtils';
import { HighlightedText } from './HighlightedText';
import { IconButton } from '../ui';

type EditorMode = 'write' | 'preview' | 'split';

type HistoryEntry = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const TEXT_SIZE_STEPS = [
  { fontSize: '0.75rem', lineHeight: '1.5rem' },
  { fontSize: '0.825rem', lineHeight: '1.65rem' },
  { fontSize: '0.9rem', lineHeight: '1.8rem' },
  { fontSize: '1rem', lineHeight: '2rem' },
  { fontSize: '1.125rem', lineHeight: '2.25rem' },
  { fontSize: '1.25rem', lineHeight: '2.5rem' },
  { fontSize: '1.375rem', lineHeight: '2.75rem' },
] as const;
const DEFAULT_TEXT_SIZE_STEP = 3;
const MAX_UNDO_ENTRIES = 100;
const TYPING_UNDO_COALESCE_MS = 800;

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  markdownEnabled?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minHeightClassName?: string;
  textClassName?: string;
  previewClassName?: string;
  highlightHtml?: string | null;
  focusQuery?: string | null;
  focusRequestId?: number;
  onFocusQueryHandled?: () => void;
  fillHeight?: boolean;
  identityKey?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  markdownEnabled = false,
  readOnly = false,
  disabled = false,
  placeholder,
  minHeightClassName = 'min-h-[220px]',
  textClassName = 'text-sm leading-relaxed',
  previewClassName = 'prose prose-sm max-w-none',
  highlightHtml,
  focusQuery = null,
  focusRequestId = 0,
  onFocusQueryHandled,
  fillHeight = false,
  identityKey = 'default',
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const setShowHelp = useUiStore((state) => state.setShowHelp);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement | null>(null);
  const readOnlyHighlightRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastValueRef = useRef(value);
  const lastTypingChangeAtRef = useRef(0);
  const previousIdentityRef = useRef(identityKey);
  const [mode, setMode] = useState<EditorMode>('write');
  const [textSizeStep, setTextSizeStep] = useState(DEFAULT_TEXT_SIZE_STEP);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const previewHtml = useMemo(() => {
    if (mode === 'write' && !readOnly) return '';
    return renderMarkdownToHtmlFragment(value);
  }, [mode, readOnly, value]);
  const textSizeStyle = TEXT_SIZE_STEPS[textSizeStep];
  const activeCommands = useMemo(() => {
    if (!markdownEnabled || mode === 'preview') {
      return {
        bold: false,
        italic: false,
        'heading-1': false,
        'heading-2': false,
        'heading-3': false,
        link: false,
        footnote: false,
        'unordered-list': false,
        'ordered-list': false,
      };
    }
    return getActiveMarkdownCommands(value, selection.start, selection.end);
  }, [markdownEnabled, mode, selection.end, selection.start, value]);
  const commandEditingDisabled = readOnly || disabled || mode === 'preview';

  useEffect(() => {
    if (previousIdentityRef.current === identityKey) {
      lastValueRef.current = value;
      return;
    }

    previousIdentityRef.current = identityKey;
    lastValueRef.current = value;
    lastTypingChangeAtRef.current = 0;
    undoStackRef.current = [];
    redoStackRef.current = [];
    updateSelection(0, 0);
    requestAnimationFrame(() => {
      const element = textareaRef.current ?? readOnlyHighlightRef.current;
      if (!element) return;
      element.scrollTop = 0;
      if (element instanceof HTMLTextAreaElement) {
        element.setSelectionRange(0, 0);
      }
      syncHighlightLayer();
    });
  }, [identityKey, value]);

  useEffect(() => {
    if (!markdownEnabled && mode === 'split') {
      setMode('write');
    }
  }, [markdownEnabled, mode]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    updateSelection(element.selectionStart, element.selectionEnd);
  }, [mode]);

  useEffect(() => {
    if (readOnly) {
      setToolbarOpen(false);
    }
  }, [readOnly]);

  useEffect(() => {
    if (!focusQuery) return;
    const normalizedQuery = focusQuery.trim();
    if (!normalizedQuery) return;
    const lowerValue = value.toLowerCase();
    const lowerQuery = normalizedQuery.toLowerCase();
    const matchIndex = lowerValue.indexOf(lowerQuery);
    if (matchIndex === -1) return;

    setMode('write');
    requestAnimationFrame(() => {
      const element = textareaRef.current ?? readOnlyHighlightRef.current;
      if (!element) return;
      element.scrollTop = Math.max(0, element.scrollHeight * (matchIndex / Math.max(1, value.length)) - 120);
      syncHighlightLayer();
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
      onFocusQueryHandled?.();
    });
  }, [focusQuery, focusRequestId, onFocusQueryHandled, value]);

  const syncHighlightLayer = () => {
    if (highlightLayerRef.current && textareaRef.current) {
      highlightLayerRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const updateSelection = (start: number, end: number) => {
    setSelection((current) =>
      current.start === start && current.end === end
        ? current
        : { start, end },
    );
  };

  const syncSelection = () => {
    const element = textareaRef.current;
    if (!element) return;
    updateSelection(element.selectionStart, element.selectionEnd);
  };

  const currentHistoryEntry = (): HistoryEntry => {
    const element = textareaRef.current;
    return {
      value: lastValueRef.current,
      selectionStart: element?.selectionStart ?? selection.start,
      selectionEnd: element?.selectionEnd ?? selection.end,
    };
  };

  const pushUndoEntry = (entry: HistoryEntry, coalesceTyping = false) => {
    const now = Date.now();
    const stack = undoStackRef.current;
    const shouldCoalesce =
      coalesceTyping &&
      stack.length > 0 &&
      now - lastTypingChangeAtRef.current < TYPING_UNDO_COALESCE_MS;

    if (!shouldCoalesce && stack[stack.length - 1]?.value !== entry.value) {
      stack.push(entry);
      if (stack.length > MAX_UNDO_ENTRIES) stack.shift();
    }

    lastTypingChangeAtRef.current = coalesceTyping ? now : 0;
    redoStackRef.current = [];
  };

  const restoreHistoryEntry = (
    entry: HistoryEntry,
    oppositeStack: MutableRefObject<HistoryEntry[]>,
  ) => {
    oppositeStack.current.push(currentHistoryEntry());
    if (oppositeStack.current.length > MAX_UNDO_ENTRIES) oppositeStack.current.shift();
    lastValueRef.current = entry.value;
    onChange(entry.value);
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      const safeStart = Math.min(entry.selectionStart, entry.value.length);
      const safeEnd = Math.min(entry.selectionEnd, entry.value.length);
      element.setSelectionRange(safeStart, safeEnd);
      updateSelection(safeStart, safeEnd);
      syncHighlightLayer();
    });
  };

  const undo = () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    restoreHistoryEntry(entry, redoStackRef);
  };

  const redo = () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    restoreHistoryEntry(entry, undoStackRef);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || disabled) return;
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (!modifier || event.altKey) return;

    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === 'y') {
      event.preventDefault();
      redo();
    }
  };

  const handleTextChange = (nextValue: string) => {
    if (readOnly || disabled) return;
    if (nextValue === lastValueRef.current) return;
    pushUndoEntry(currentHistoryEntry(), true);
    lastValueRef.current = nextValue;
    onChange(nextValue);
  };

  const applyCommand = (command: MarkdownCommand) => {
    const element = textareaRef.current;
    if (!element || readOnly || disabled || !markdownEnabled) return;
    pushUndoEntry(currentHistoryEntry());
    const result = applyMarkdownCommand({
      command,
      value,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
    });
    lastValueRef.current = result.value;
    onChange(result.value);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
      updateSelection(result.selectionStart, result.selectionEnd);
    });
  };

  const textareaClassName = `${fillHeight ? 'flex-1 min-h-[100px] h-0' : minHeightClassName} w-full resize-y bg-transparent outline-none custom-scrollbar ${textClassName} disabled:opacity-70 read-only:cursor-not-allowed`;

  const textarea = (
    <textarea
      ref={textareaRef}
      data-scroll-sync="true"
      value={value}
      onChange={(event) => handleTextChange(event.target.value)}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      onClick={syncSelection}
      onKeyDown={handleKeyDown}
      onKeyUp={syncSelection}
      onSelect={syncSelection}
      onScroll={syncHighlightLayer}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className={textareaClassName}
      style={textSizeStyle}
    />
  );

  const readOnlyText = (
    <div
      ref={readOnlyHighlightRef}
      data-scroll-sync="true"
      className={`${fillHeight ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : minHeightClassName} w-full whitespace-pre-wrap break-words ${textClassName}`}
      style={textSizeStyle}
    >
      {value || (
        <span className="text-editorial-muted">
          {placeholder ?? ''}
        </span>
      )}
    </div>
  );

  const preview = (
    <div
      data-scroll-sync="true"
      className={`${fillHeight ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : minHeightClassName} rounded-2xl border border-editorial-border bg-editorial-textbox/60 p-4 ${previewClassName}`}
      style={textSizeStyle}
    >
      {value.trim() ? (
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : (
        <p className="text-editorial-muted">{t('editor.previewEmpty')}</p>
      )}
    </div>
  );

  return (
    <div className={fillHeight ? 'flex flex-col flex-1 min-h-0' : 'space-y-3'}>
      <div className={`sticky top-0 z-20 rounded-2xl border border-editorial-border/70 bg-[#fcfaf5]/95 px-3 py-3 shadow-sm backdrop-blur${fillHeight ? ' shrink-0' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <IconButton
            size="md"
            onClick={() => setToolbarOpen((open) => !open)}
            title={toolbarOpen ? t('editor.hideToolbar') : t('editor.showToolbar')}
            ariaPressed={toolbarOpen}
            tooltipSide="bottom"
          >
            {toolbarOpen ? <PanelTopClose size={15} /> : <PanelTopOpen size={15} />}
          </IconButton>
          {/* Mode indicators — non-interactive, show current editor state */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" aria-hidden="true">
              <span className={`rounded-full p-1.5 transition-colors ${mode === 'write' ? 'bg-editorial-accent text-white' : 'text-editorial-border'}`}>
                <Pencil size={11} />
              </span>
              <span className={`rounded-full p-1.5 transition-colors ${mode === 'preview' ? 'bg-editorial-accent text-white' : 'text-editorial-border'}`}>
                <Eye size={11} />
              </span>
              {markdownEnabled ? (
                <span className={`rounded-full p-1.5 transition-colors ${mode === 'split' ? 'bg-editorial-accent text-white' : 'text-editorial-border'}`}>
                  <Columns2 size={11} />
                </span>
              ) : null}
            </div>
            {toolbarOpen ? (
              <IconButton
                size="md"
                tone="muted"
                onClick={() => setShowHelp(true, 'features')}
                title={t('editor.markdownHelpTooltip')}
                tooltipSide="bottom"
              >
                <CircleHelp size={15} />
              </IconButton>
            ) : null}
          </div>
        </div>
        {toolbarOpen ? (
          <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-editorial-border/60 pb-3">
          <div className="flex items-center gap-2">
            <ToolbarButton
              active={mode === 'write'}
              onClick={() => setMode('write')}
              title={t('editor.write')}
              ariaLabel={t('editor.write')}
            >
              <Pencil size={15} />
            </ToolbarButton>
            <ToolbarButton
              active={mode === 'preview'}
              onClick={() => setMode('preview')}
              title={t('editor.preview')}
              ariaLabel={t('editor.preview')}
            >
              <Eye size={15} />
            </ToolbarButton>
            {markdownEnabled && (
              <ToolbarButton
                active={mode === 'split'}
                onClick={() => setMode('split')}
                title={t('editor.split')}
                ariaLabel={t('editor.split')}
              >
                <Columns2 size={15} />
              </ToolbarButton>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-editorial-muted">
              {t('editor.textSize')}
            </span>
            <div className="flex items-center gap-1">
              <ToolbarButton
                active={false}
                onClick={() => setTextSizeStep((s) => Math.max(0, s - 1))}
                title={t('editor.textSmall')}
                ariaLabel={t('editor.textSmall')}
                disabled={textSizeStep === 0}
              >
                <Minus size={15} />
              </ToolbarButton>
              <ToolbarButton
                active={textSizeStep === DEFAULT_TEXT_SIZE_STEP}
                onClick={() => setTextSizeStep(DEFAULT_TEXT_SIZE_STEP)}
                title={t('editor.textMedium')}
                ariaLabel={t('editor.textMedium')}
              >
                <Type size={15} />
              </ToolbarButton>
              <ToolbarButton
                active={false}
                onClick={() => setTextSizeStep((s) => Math.min(TEXT_SIZE_STEPS.length - 1, s + 1))}
                title={t('editor.textLarge')}
                ariaLabel={t('editor.textLarge')}
                disabled={textSizeStep === TEXT_SIZE_STEPS.length - 1}
              >
                <Plus size={15} />
              </ToolbarButton>
            </div>
          </div>
        </div>

        {markdownEnabled ? (
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <ToolbarLabel>{t('editor.inlineLabel')}</ToolbarLabel>
            <CommandButton
              active={activeCommands.bold}
              onClick={() => applyCommand('bold')}
              title={t('editor.bold')}
              ariaLabel={t('editor.bold')}
              disabled={commandEditingDisabled}
            >
              <Bold size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands.italic}
              onClick={() => applyCommand('italic')}
              title={t('editor.italic')}
              ariaLabel={t('editor.italic')}
              disabled={commandEditingDisabled}
            >
              <Italic size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands.link}
              onClick={() => applyCommand('link')}
              title={t('editor.link')}
              ariaLabel={t('editor.link')}
              disabled={commandEditingDisabled}
            >
              <Link2 size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands.footnote}
              onClick={() => applyCommand('footnote')}
              title={t('editor.footnote')}
              ariaLabel={t('editor.footnote')}
              disabled={commandEditingDisabled}
            >
              <Pilcrow size={15} />
            </CommandButton>

            <ToolbarSeparator />
            <ToolbarLabel>{t('editor.structureLabel')}</ToolbarLabel>
            <CommandButton
              active={activeCommands['heading-1']}
              onClick={() => applyCommand('heading-1')}
              title={t('editor.heading1')}
              ariaLabel={t('editor.heading1')}
              disabled={commandEditingDisabled}
            >
              <Heading1 size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands['heading-2']}
              onClick={() => applyCommand('heading-2')}
              title={t('editor.heading2')}
              ariaLabel={t('editor.heading2')}
              disabled={commandEditingDisabled}
            >
              <Heading2 size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands['heading-3']}
              onClick={() => applyCommand('heading-3')}
              title={t('editor.heading3')}
              ariaLabel={t('editor.heading3')}
              disabled={commandEditingDisabled}
            >
              <Heading3 size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands['unordered-list']}
              onClick={() => applyCommand('unordered-list')}
              title={t('editor.unorderedList')}
              ariaLabel={t('editor.unorderedList')}
              disabled={commandEditingDisabled}
            >
              <List size={15} />
            </CommandButton>
            <CommandButton
              active={activeCommands['ordered-list']}
              onClick={() => applyCommand('ordered-list')}
              title={t('editor.orderedList')}
              ariaLabel={t('editor.orderedList')}
              disabled={commandEditingDisabled}
            >
              <ListOrdered size={15} />
            </CommandButton>
          </div>
        ) : null}
          </>
        ) : null}
      </div>
      {mode === 'write' && !readOnly && highlightHtml ? (
        fillHeight ? (
          // Overlay: HighlightedText behind transparent textarea — styled text visible while editing
          <div className="relative flex-1 min-h-0">
            <HighlightedText
              ref={highlightLayerRef}
              html={highlightHtml}
              style={{ ...textSizeStyle, minHeight: 0 }}
              className={`pointer-events-none absolute inset-0 overflow-y-scroll scrollbar-hidden whitespace-pre-wrap break-words select-none ${textClassName}`}
            />
            <textarea
              ref={textareaRef}
              data-scroll-sync="true"
              value={value}
              onChange={(event) => handleTextChange(event.target.value)}
              disabled={disabled}
              placeholder={placeholder}
              onClick={syncSelection}
              onKeyDown={handleKeyDown}
              onKeyUp={syncSelection}
              onSelect={syncSelection}
              onScroll={syncHighlightLayer}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className={`${textareaClassName} absolute inset-0 h-full w-full resize-none`}
              style={{ ...textSizeStyle, color: 'transparent', caretColor: 'var(--color-editorial-ink)' }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {textarea}
            <HighlightedText html={highlightHtml} style={textSizeStyle} className={`${minHeightClassName} ${textClassName}`} />
          </div>
        )
      ) : null}
      {mode === 'write' && readOnly && highlightHtml ? (
        <HighlightedText
          ref={readOnlyHighlightRef}
          data-scroll-sync="true"
          html={highlightHtml}
          style={textSizeStyle}
          className={fillHeight ? `flex-1 min-h-0 overflow-y-auto custom-scrollbar ${textClassName}` : `${minHeightClassName} ${textClassName}`}
        />
      ) : null}
      {mode === 'write' && readOnly && !highlightHtml ? readOnlyText : null}
      {mode === 'write' && !readOnly && !highlightHtml ? textarea : null}
      {mode === 'preview' ? preview : null}
      {mode === 'split' ? (
        fillHeight ? (
          <div className="flex-1 min-h-0 grid gap-4 xl:grid-cols-2">
            {readOnly ? readOnlyText : (
              <textarea
                ref={textareaRef}
                data-scroll-sync="true"
                value={value}
                onChange={(event) => handleTextChange(event.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                onClick={syncSelection}
                onKeyDown={handleKeyDown}
                onKeyUp={syncSelection}
                onSelect={syncSelection}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className={`h-full resize-none w-full bg-transparent outline-none custom-scrollbar ${textClassName} disabled:opacity-70`}
                style={textSizeStyle}
              />
            )}
            {preview}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {textarea}
            {preview}
          </div>
        )
      ) : null}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  ariaLabel,
  disabled = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton
      size="md"
      tone={active ? 'accent' : 'default'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      ariaLabel={ariaLabel}
      disabled={disabled}
      ariaPressed={active}
      tooltipSide="bottom"
    >
      {children}
    </IconButton>
  );
}

function CommandButton({
  active,
  onClick,
  title,
  ariaLabel,
  disabled = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton
      size="md"
      tone={active ? 'accent' : 'default'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      ariaLabel={ariaLabel}
      disabled={disabled}
      ariaPressed={active}
      tooltipSide="bottom"
    >
      {children}
    </IconButton>
  );
}

function ToolbarLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
      {children}
    </span>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-5 w-px bg-editorial-border/80" aria-hidden="true" />;
}
