import { Bold, ChevronDown, ChevronUp, Columns2, Eye, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, PanelTopClose, PanelTopOpen, Pencil, Pilcrow, Plus, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdownToHtmlFragment } from '../../services/markdown';
import {
  applyMarkdownCommand,
  getActiveMarkdownCommands,
  type MarkdownCommand,
} from './markdownEditorUtils';
import { HighlightedText } from './HighlightedText';

type EditorMode = 'write' | 'preview' | 'split';
type TextSize = 'sm' | 'md' | 'lg';

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
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<EditorMode>('write');
  const [textSize, setTextSize] = useState<TextSize>('md');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const previewHtml = useMemo(() => {
    if (mode === 'write' && !readOnly) return '';
    return renderMarkdownToHtmlFragment(value);
  }, [mode, readOnly, value]);
  const textSizeStyles: Record<TextSize, { fontSize: string }> = {
    sm: { fontSize: '0.95rem' },
    md: { fontSize: '1rem' },
    lg: { fontSize: '1.125rem' },
  };
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
    const element = textareaRef.current;
    if (!element) return;
    const normalizedQuery = focusQuery.trim();
    if (!normalizedQuery) return;
    const lowerValue = value.toLowerCase();
    const lowerQuery = normalizedQuery.toLowerCase();
    const matchIndex = lowerValue.indexOf(lowerQuery);
    if (matchIndex === -1) return;

    setMode('write');
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(matchIndex, matchIndex + normalizedQuery.length);
      element.scrollTop = Math.max(0, element.scrollHeight * (matchIndex / Math.max(1, value.length)) - 120);
      updateSelection(matchIndex, matchIndex + normalizedQuery.length);
      onFocusQueryHandled?.();
    });
  }, [focusQuery, focusRequestId, onFocusQueryHandled, value]);

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

  const applyCommand = (command: MarkdownCommand) => {
    const element = textareaRef.current;
    if (!element || readOnly || disabled || !markdownEnabled) return;
    const result = applyMarkdownCommand({
      command,
      value,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
    });
    onChange(result.value);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
      updateSelection(result.selectionStart, result.selectionEnd);
    });
  };

  const textarea = (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      onClick={syncSelection}
      onKeyUp={syncSelection}
      onSelect={syncSelection}
      className={`${minHeightClassName} w-full resize-y bg-transparent outline-none ${textClassName} disabled:opacity-70 read-only:cursor-not-allowed`}
      style={textSizeStyles[textSize]}
    />
  );

  const preview = (
    <div
      className={`${minHeightClassName} rounded-2xl border border-editorial-border/70 bg-editorial-bg/55 p-4 ${previewClassName}`}
      style={textSizeStyles[textSize]}
    >
      {value.trim() ? (
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : (
        <p className="text-editorial-muted">{t('editor.previewEmpty')}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 rounded-2xl border border-editorial-border/70 bg-[#fcfaf5]/95 px-3 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setToolbarOpen((open) => !open)}
            title={toolbarOpen ? t('editor.hideToolbar') : t('editor.showToolbar')}
            aria-label={toolbarOpen ? t('editor.hideToolbar') : t('editor.showToolbar')}
            className="rounded-full border border-editorial-border bg-white/70 p-2 text-editorial-muted transition-colors hover:text-editorial-ink"
          >
            {toolbarOpen ? <PanelTopClose size={15} /> : <PanelTopOpen size={15} />}
          </button>
          <div className="flex items-center gap-2 text-editorial-muted">
            <span className={`rounded-full border p-1.5 ${mode === 'write' ? 'border-editorial-ink bg-editorial-ink text-white' : 'border-editorial-border bg-white/70'}`}>
              <Pencil size={13} />
            </span>
            <span className={`rounded-full border p-1.5 ${mode === 'preview' ? 'border-editorial-ink bg-editorial-ink text-white' : 'border-editorial-border bg-white/70'}`}>
              <Eye size={13} />
            </span>
            {markdownEnabled ? (
              <span className={`rounded-full border p-1.5 ${mode === 'split' ? 'border-editorial-ink bg-editorial-ink text-white' : 'border-editorial-border bg-white/70'}`}>
                <Columns2 size={13} />
              </span>
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
              <PencilIcon />
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
                active={textSize === 'sm'}
                onClick={() => setTextSize('sm')}
                title={t('editor.textSmall')}
                ariaLabel={t('editor.textSmall')}
              >
                <Minus size={15} />
              </ToolbarButton>
              <ToolbarButton
                active={textSize === 'md'}
                onClick={() => setTextSize('md')}
                title={t('editor.textMedium')}
                ariaLabel={t('editor.textMedium')}
              >
                <Type size={15} />
              </ToolbarButton>
              <ToolbarButton
                active={textSize === 'lg'}
                onClick={() => setTextSize('lg')}
                title={t('editor.textLarge')}
                ariaLabel={t('editor.textLarge')}
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
              <ListIcon />
            </CommandButton>
            <CommandButton
              active={activeCommands['ordered-list']}
              onClick={() => applyCommand('ordered-list')}
              title={t('editor.orderedList')}
              ariaLabel={t('editor.orderedList')}
              disabled={commandEditingDisabled}
            >
              <ListOrderedIcon />
            </CommandButton>
          </div>
        ) : null}
          </>
        ) : null}
      </div>
      {mode === 'write' && !readOnly && highlightHtml ? (
        <div className="space-y-2">
          {textarea}
          <HighlightedText html={highlightHtml} className={`${minHeightClassName} ${textClassName}`} />
        </div>
      ) : null}
      {mode === 'write' && (!highlightHtml || readOnly) ? textarea : null}
      {mode === 'preview' ? preview : null}
      {mode === 'split' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {textarea}
          {preview}
        </div>
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
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`rounded-full border p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'border-editorial-ink bg-editorial-ink text-white'
          : 'border-editorial-border text-editorial-muted hover:text-editorial-ink'
      }`}
    >
      {children}
    </button>
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
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      className={`rounded-full border px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'border-editorial-accent bg-editorial-accent text-white shadow-sm'
          : 'border-editorial-border bg-white/80 text-editorial-muted hover:text-editorial-ink'
      }`}
    >
      {children}
    </button>
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

function PencilIcon() {
  return <Pencil size={15} />;
}

function ListIcon() {
  return <List size={15} />;
}

function ListOrderedIcon() {
  return <ListOrdered size={15} />;
}
