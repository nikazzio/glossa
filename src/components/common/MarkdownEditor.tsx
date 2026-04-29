import { Bold, Columns2, Eye, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pencil, Pilcrow, Plus, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdownToHtmlFragment } from '../../services/markdown';
import {
  applyMarkdownCommand,
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
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<EditorMode>('write');
  const [textSize, setTextSize] = useState<TextSize>('md');
  const previewHtml = useMemo(() => renderMarkdownToHtmlFragment(value), [value]);
  const sizeClasses: Record<TextSize, string> = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  useEffect(() => {
    if (!markdownEnabled && mode === 'split') {
      setMode('write');
    }
  }, [markdownEnabled, mode]);

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
      className={`${minHeightClassName} w-full resize-y bg-transparent outline-none ${sizeClasses[textSize]} ${textClassName} disabled:opacity-70 read-only:cursor-not-allowed`}
    />
  );

  const preview = (
    <div
      className={`${minHeightClassName} rounded-2xl border border-editorial-border/70 bg-editorial-bg/55 p-4 ${sizeClasses[textSize]} ${previewClassName}`}
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-editorial-border/70 bg-editorial-bg/55 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1">
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
        <div className="flex flex-wrap items-center gap-1">
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
          {markdownEnabled && (
            <button
              type="button"
              title={t('editor.bold')}
              aria-label={t('editor.bold')}
              onClick={() => applyCommand('bold')}
              disabled={readOnly || disabled}
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
            >
              <Bold size={15} />
            </button>
          )}
          {markdownEnabled && (
            <>
              <button
                type="button"
                title={t('editor.italic')}
                aria-label={t('editor.italic')}
                onClick={() => applyCommand('italic')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <Italic size={15} />
              </button>
              <button
                type="button"
                title={t('editor.heading1')}
                aria-label={t('editor.heading1')}
                onClick={() => applyCommand('heading-1')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <Heading1 size={15} />
              </button>
              <button
                type="button"
                title={t('editor.heading2')}
                aria-label={t('editor.heading2')}
                onClick={() => applyCommand('heading-2')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <Heading2 size={15} />
              </button>
              <button
                type="button"
                title={t('editor.heading3')}
                aria-label={t('editor.heading3')}
                onClick={() => applyCommand('heading-3')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <Heading3 size={15} />
              </button>
              <button
                type="button"
                title={t('editor.link')}
                aria-label={t('editor.link')}
                onClick={() => applyCommand('link')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <Link2 size={15} />
              </button>
              <button
                type="button"
                title={t('editor.footnote')}
                aria-label={t('editor.footnote')}
                onClick={() => applyCommand('footnote')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <Pilcrow size={15} />
              </button>
            </>
          )}
          {markdownEnabled && (
            <>
              <button
                type="button"
                title={t('editor.unorderedList')}
                aria-label={t('editor.unorderedList')}
                onClick={() => applyCommand('unordered-list')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <ListIcon />
              </button>
              <button
                type="button"
                title={t('editor.orderedList')}
                aria-label={t('editor.orderedList')}
                onClick={() => applyCommand('ordered-list')}
                disabled={readOnly || disabled}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
              >
                <ListOrderedIcon />
              </button>
            </>
          )}
        </div>
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
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`rounded-full border p-2 transition-colors ${
        active
          ? 'border-editorial-ink bg-editorial-ink text-white'
          : 'border-editorial-border text-editorial-muted hover:text-editorial-ink'
      }`}
    >
      {children}
    </button>
  );
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
