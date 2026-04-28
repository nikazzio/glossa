import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdownToHtmlFragment } from '../../services/markdown';
import {
  applyMarkdownCommand,
  type MarkdownCommand,
} from './markdownEditorUtils';
import { HighlightedText } from './HighlightedText';

type EditorMode = 'write' | 'preview' | 'split';

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

const COMMANDS: { key: MarkdownCommand; label: string }[] = [
  { key: 'bold', label: 'B' },
  { key: 'italic', label: 'I' },
  { key: 'heading-1', label: 'H1' },
  { key: 'heading-2', label: 'H2' },
  { key: 'heading-3', label: 'H3' },
  { key: 'link', label: 'Link' },
  { key: 'footnote', label: 'Fn' },
  { key: 'unordered-list', label: 'UL' },
  { key: 'ordered-list', label: 'OL' },
];

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
  const [mode, setMode] = useState<EditorMode>(markdownEnabled ? 'split' : 'write');
  const previewHtml = useMemo(() => renderMarkdownToHtmlFragment(value), [value]);

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
      className={`${minHeightClassName} w-full resize-y bg-transparent outline-none ${textClassName} disabled:opacity-70 read-only:cursor-not-allowed`}
    />
  );

  const preview = (
    <div
      className={`${minHeightClassName} rounded-2xl border border-editorial-border/70 bg-editorial-bg/55 p-4 ${previewClassName}`}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <ModeButton
            active={mode === 'write'}
            onClick={() => setMode('write')}
            label={t('editor.write')}
          />
          <ModeButton
            active={mode === 'preview'}
            onClick={() => setMode('preview')}
            label={t('editor.preview')}
          />
          {markdownEnabled && (
            <ModeButton
              active={mode === 'split'}
              onClick={() => setMode('split')}
              label={t('editor.split')}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {COMMANDS.map((command) => (
            <button
              key={command.key}
              type="button"
              onClick={() => applyCommand(command.key)}
              disabled={!markdownEnabled || readOnly || disabled}
              className="rounded-full border border-editorial-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-35"
            >
              {command.label}
            </button>
          ))}
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

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'border-editorial-ink bg-editorial-ink text-white'
          : 'border-editorial-border text-editorial-muted hover:text-editorial-ink'
      }`}
    >
      {label}
    </button>
  );
}
