import { Bold, CircleHelp, Columns2, Eye, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, PanelTopClose, PanelTopOpen, Pencil, Pilcrow, Plus, Type } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { renderMarkdownToHtmlFragment } from '../../services/markdown';
import {
  applyMarkdownCommand,
  getActiveMarkdownCommands,
  type MarkdownCommand,
} from './markdownEditorUtils';
import { HighlightedText } from './HighlightedText';
import { CopyButton } from '../ui';
import { IconButton } from '../ui';
import { escapeHtml } from '../../hooks/useGlossaryHighlight';

type EditorMode = 'write' | 'preview' | 'split';

type HistoryEntry = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const TEXT_SIZE_STEPS = [
  { fontSize: '0.75rem', lineHeight: '1.5rem' },
  { fontSize: '0.8125rem', lineHeight: '1.625rem' },  // sm
  { fontSize: '0.9rem', lineHeight: '1.8rem' },
  { fontSize: '0.9375rem', lineHeight: '1.875rem' }, // md
  { fontSize: '1rem', lineHeight: '2rem' },
  { fontSize: '1.0625rem', lineHeight: '2.125rem' }, // lg
  { fontSize: '1.125rem', lineHeight: '2.25rem' },
  { fontSize: '1.25rem', lineHeight: '2.5rem' },
  { fontSize: '1.375rem', lineHeight: '2.75rem' },
] as const;
export const DOC_FONT_SIZE_STEP_INDEX = { sm: 1, md: 3, lg: 5 } as const;
const DEFAULT_TEXT_SIZE_STEP = 3; // md
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
  previewValue?: string;
  defaultTextSizeStep?: number;
  useDocLineHeight?: boolean;
  // Shell nuova (#291): toolbar a filo (niente cornice arrotondata/ombra/rilievo),
  // coerente coi pannelli flush. Senza prop resta la pillola classica della shell vecchia.
  flatToolbar?: boolean;
  // Shell nuova (#291): menu controllato dall'esterno. Quando il contenitore fornisce
  // questi prop, l'editor non disegna più la propria barra di controlli: il pulsante che
  // apre il menu vive nell'header della pagina, e qui resta solo il pannello a scomparsa
  // (modalità + dimensione testo + formattazione + copia) mostrato quando menuOpen è true.
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  // Testo da copiare dentro il menu (es. la traduzione). Se assente, nessun pulsante copia.
  copyText?: string;
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
  defaultTextSizeStep,
  useDocLineHeight = false,
  highlightHtml,
  focusQuery = null,
  focusRequestId = 0,
  onFocusQueryHandled,
  fillHeight = false,
  identityKey = 'default',
  previewValue,
  flatToolbar = false,
  menuOpen,
  onMenuOpenChange,
  copyText,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  // Menu controllato dall'esterno (header pagina) vs barra interna classica.
  const externalMenu = flatToolbar && onMenuOpenChange !== undefined;
  const setShowHelp = useUiStore((state) => state.setShowHelp);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement | null>(null);
  const readOnlyHighlightRef = useRef<HTMLDivElement | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastValueRef = useRef(value);
  const lastTypingChangeAtRef = useRef(0);
  const previousIdentityRef = useRef(identityKey);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const [mode, setMode] = useState<EditorMode>('write');
  const [textSizeStep, setTextSizeStep] = useState(defaultTextSizeStep ?? DEFAULT_TEXT_SIZE_STEP);
  useEffect(() => {
    if (defaultTextSizeStep !== undefined) setTextSizeStep(defaultTextSizeStep);
  }, [defaultTextSizeStep]);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const previewHtml = useMemo(() => {
    if (mode === 'write' && !readOnly) return '';
    return renderMarkdownToHtmlFragment(previewValue ?? value, { stripFootnoteNav: true });
  }, [mode, readOnly, value, previewValue]);
  // Chi passa `highlightHtml` (anche `null`, quando al momento non c'è nulla da
  // evidenziare) resta SEMPRE sulla stessa struttura a doppio livello (overlay
  // colorato + textarea invisibile sotto): accendere/spegnere l'evidenziazione
  // non deve mai smontare/rimontare un layout diverso, altrimenti il testo
  // "salta" — sia come impaginazione (il calcolo del testo a capo cambia) sia
  // come scroll (il browser azzera lo scrollTop quando cambia struttura DOM).
  // Solo chi non usa mai questa prop (altri usi di MarkdownEditor senza
  // evidenziazione) resta sulla textarea semplice originale.
  const usesHighlightOverlay = highlightHtml !== undefined;
  const resolvedHighlightHtml = highlightHtml ?? escapeHtml(value);
  const textSizeStyle = TEXT_SIZE_STEPS[textSizeStep];
  const effectiveStyle = useDocLineHeight
    ? { ...textSizeStyle, lineHeight: 'var(--doc-line-height)' }
    : textSizeStyle;
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
    pendingScrollRestoreRef.current = null;
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
    const currentValue = lastValueRef.current;
    const lowerValue = currentValue.toLowerCase();
    const lowerQuery = normalizedQuery.toLowerCase();
    const matchIndex = lowerValue.indexOf(lowerQuery);
    if (matchIndex === -1) return;

    setMode('write');
    requestAnimationFrame(() => {
      const element = textareaRef.current ?? readOnlyHighlightRef.current;
      if (!element) return;
      element.scrollTop = Math.max(0, element.scrollHeight * (matchIndex / Math.max(1, currentValue.length)) - 120);
      syncHighlightLayer();
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
      onFocusQueryHandled?.();
    });
    // Scatta solo su nuovo target audit (focusQuery/focusRequestId), non su ogni edit:
    // altrimenti paste/typing rilancia lo scroll-to-match e salta la vista dell'utente.
  }, [focusQuery, focusRequestId, onFocusQueryHandled]);

  const syncHighlightLayer = () => {
    if (highlightLayerRef.current && textareaRef.current) {
      highlightLayerRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Il livello colorato (dietro la textarea trasparente) sostituisce il suo
  // contenuto ad ogni modifica (nuovo HTML evidenziato) — e i browser azzerano
  // lo scrollTop di un elemento quando il suo contenuto viene sostituito. Senza
  // questo, scrivere o incollare fa "saltare" il testo visibile (che vive lì,
  // non nella textarea invisibile sopra) in cima al riquadro. Layout effect
  // (non effect normale) per correggerlo prima che il browser disegni il frame.
  //
  // Rinforzo: comparsa/sparizione di un singolo <mark> (es. selezionare/
  // deselezionare un'issue audit) può cambiare leggermente l'altezza del
  // contenuto e far "clampare" lo scrollTop reale della textarea, non solo
  // quello del livello overlay — la cleanup cattura lo scrollTop reale PRIMA
  // che React applichi il prossimo highlightHtml, il run successivo lo
  // ripristina esplicitamente invece di fidarsi che il browser lo preservi.
  useLayoutEffect(() => {
    if (!usesHighlightOverlay) return;
    const element = textareaRef.current;
    if (element && pendingScrollRestoreRef.current !== null) {
      element.scrollTop = pendingScrollRestoreRef.current;
    }
    syncHighlightLayer();
    return () => {
      pendingScrollRestoreRef.current = element?.scrollTop ?? null;
    };
  }, [resolvedHighlightHtml, usesHighlightOverlay]);

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

  const textareaClassName = `${fillHeight ? 'flex-1 min-h-[100px] h-0' : minHeightClassName} w-full ${fillHeight ? 'resize-none' : 'resize-y'} bg-transparent outline-none custom-scrollbar ${textClassName} disabled:opacity-70 read-only:cursor-not-allowed`;

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
      style={effectiveStyle}
    />
  );

  const readOnlyText = (
    <div
      ref={readOnlyHighlightRef}
      data-scroll-sync="true"
      className={`${fillHeight ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : minHeightClassName} w-full whitespace-pre-wrap break-words ${textClassName}`}
      style={effectiveStyle}
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
      className={`${fillHeight ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : minHeightClassName} rounded-xl border border-editorial-border bg-editorial-textbox/60 p-4 ${previewClassName}`}
      style={effectiveStyle}
    >
      {value.trim() ? (
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : (
        <p className="text-editorial-muted">{t('editor.previewEmpty')}</p>
      )}
    </div>
  );

  // Controlli testo riusabili fra barra interna (shell vecchia) e menu esterno (shell nuova).
  const modeControls = (
    <>
      <ToolbarButton active={mode === 'write'} onClick={() => setMode('write')} title={t('editor.write')} ariaLabel={t('editor.write')}>
        <Pencil size={15} />
      </ToolbarButton>
      <ToolbarButton active={mode === 'preview'} onClick={() => setMode('preview')} title={t('editor.preview')} ariaLabel={t('editor.preview')}>
        <Eye size={15} />
      </ToolbarButton>
      {markdownEnabled && (
        <ToolbarButton active={mode === 'split'} onClick={() => setMode('split')} title={t('editor.split')} ariaLabel={t('editor.split')}>
          <Columns2 size={15} />
        </ToolbarButton>
      )}
    </>
  );

  const fontControls = (
    <>
      <ToolbarButton active={false} onClick={() => setTextSizeStep((s) => Math.max(0, s - 1))} title={t('editor.textSmall')} ariaLabel={t('editor.textSmall')} disabled={textSizeStep === 0}>
        <Minus size={15} />
      </ToolbarButton>
      <ToolbarButton active={textSizeStep === DEFAULT_TEXT_SIZE_STEP} onClick={() => setTextSizeStep(DEFAULT_TEXT_SIZE_STEP)} title={t('editor.textMedium')} ariaLabel={t('editor.textMedium')}>
        <Type size={15} />
      </ToolbarButton>
      <ToolbarButton active={false} onClick={() => setTextSizeStep((s) => Math.min(TEXT_SIZE_STEPS.length - 1, s + 1))} title={t('editor.textLarge')} ariaLabel={t('editor.textLarge')} disabled={textSizeStep === TEXT_SIZE_STEPS.length - 1}>
        <Plus size={15} />
      </ToolbarButton>
    </>
  );

  const helpButton = (
    <IconButton size="md" tone="muted" onClick={() => setShowHelp(true, 'features')} title={t('editor.markdownHelpTooltip')} tooltipSide="bottom">
      <CircleHelp size={15} />
    </IconButton>
  );

  const formattingControls = (
    <>
      <ToolbarLabel>{t('editor.inlineLabel')}</ToolbarLabel>
      <ToolbarButton active={activeCommands.bold} onClick={() => applyCommand('bold')} title={t('editor.bold')} ariaLabel={t('editor.bold')} disabled={commandEditingDisabled}>
        <Bold size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands.italic} onClick={() => applyCommand('italic')} title={t('editor.italic')} ariaLabel={t('editor.italic')} disabled={commandEditingDisabled}>
        <Italic size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands.link} onClick={() => applyCommand('link')} title={t('editor.link')} ariaLabel={t('editor.link')} disabled={commandEditingDisabled}>
        <Link2 size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands.footnote} onClick={() => applyCommand('footnote')} title={t('editor.footnote')} ariaLabel={t('editor.footnote')} disabled={commandEditingDisabled}>
        <Pilcrow size={15} />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarLabel>{t('editor.structureLabel')}</ToolbarLabel>
      <ToolbarButton active={activeCommands['heading-1']} onClick={() => applyCommand('heading-1')} title={t('editor.heading1')} ariaLabel={t('editor.heading1')} disabled={commandEditingDisabled}>
        <Heading1 size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands['heading-2']} onClick={() => applyCommand('heading-2')} title={t('editor.heading2')} ariaLabel={t('editor.heading2')} disabled={commandEditingDisabled}>
        <Heading2 size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands['heading-3']} onClick={() => applyCommand('heading-3')} title={t('editor.heading3')} ariaLabel={t('editor.heading3')} disabled={commandEditingDisabled}>
        <Heading3 size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands['unordered-list']} onClick={() => applyCommand('unordered-list')} title={t('editor.unorderedList')} ariaLabel={t('editor.unorderedList')} disabled={commandEditingDisabled}>
        <List size={15} />
      </ToolbarButton>
      <ToolbarButton active={activeCommands['ordered-list']} onClick={() => applyCommand('ordered-list')} title={t('editor.orderedList')} ariaLabel={t('editor.orderedList')} disabled={commandEditingDisabled}>
        <ListOrdered size={15} />
      </ToolbarButton>
    </>
  );

  // Menu esterno (shell nuova): pannello a scomparsa unico con tutti i controlli testo.
  // Il pulsante che lo apre vive nell'header della pagina, non qui.
  const textMenuPanel = (
    <div className="flex flex-col gap-3 border-b border-editorial-border/60 px-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarLabel>{t('editor.viewLabel')}</ToolbarLabel>
        {modeControls}
        <ToolbarSeparator />
        <ToolbarLabel>{t('editor.textSize')}</ToolbarLabel>
        {fontControls}
        <div className="flex-1" />
        {copyText !== undefined ? <CopyButton text={copyText} /> : null}
        {helpButton}
      </div>
      {markdownEnabled ? (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-editorial-border/60">
          {formattingControls}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={fillHeight ? 'flex flex-col flex-1 min-h-0 gap-5' : 'space-y-3'}>
      {externalMenu ? (
        menuOpen ? (
          <div className={`sticky top-0 z-20 bg-editorial-page/95 backdrop-blur${fillHeight ? ' shrink-0' : ''}`}>
            {textMenuPanel}
          </div>
        ) : null
      ) : (
        <div className={`sticky top-0 z-20 bg-editorial-page/95 backdrop-blur${fillHeight ? ' shrink-0' : ''}${
          flatToolbar
            ? ' border-b border-editorial-border/60 px-1 py-2'
            : ' rounded-xl border border-editorial-border/70 px-3 py-3 shadow-sm'
        }`}>
          <div className="flex items-center gap-1.5">
            {markdownEnabled && (
              <IconButton
                size="md"
                onClick={() => setToolbarOpen((open) => !open)}
                title={toolbarOpen ? t('editor.hideToolbar') : t('editor.showToolbar')}
                ariaPressed={toolbarOpen}
                tooltipSide="bottom"
              >
                {toolbarOpen ? <PanelTopClose size={15} /> : <PanelTopOpen size={15} />}
              </IconButton>
            )}
            {markdownEnabled && <span className="mx-0.5 h-4 w-px shrink-0 bg-editorial-border/50" aria-hidden="true" />}
            {modeControls}
            <div className="flex-1" />
            {fontControls}
            {helpButton}
          </div>
          {toolbarOpen && markdownEnabled ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-editorial-border/60">
              {formattingControls}
            </div>
          ) : null}
        </div>
      )}
      {mode === 'write' && !readOnly && usesHighlightOverlay ? (
        fillHeight ? (
          // Overlay: HighlightedText behind transparent textarea — styled text visible while editing
          <div className="relative flex-1 min-h-0 min-w-0" onWheel={(e) => { const ta = textareaRef.current; if (ta) { ta.scrollTop += e.deltaY; e.preventDefault(); } }}>
            <HighlightedText
              ref={highlightLayerRef}
              html={resolvedHighlightHtml}
              style={{ ...effectiveStyle, minHeight: 0 }}
              // overlay-scrollbar (non custom-scrollbar): stessa larghezza esatta,
              // ma un'altra classe — usePanelScrollSync.ts cerca ".custom-scrollbar"
              // per trovare "il" contenitore di scroll di ogni riquadro; se questo
              // livello puramente decorativo (pointer-events-none) matchasse anche
              // lui quel selettore, diventerebbe un candidato ambiguo insieme alla
              // vera textarea sotto, con salti di scroll imprevedibili.
              className={`pointer-events-none absolute inset-0 overflow-y-scroll overlay-scrollbar whitespace-pre-wrap break-words select-none ${textClassName}`}
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
              // Stesse regole scrollbar del livello colorato sopra: gutter identico,
              // niente più disallineamento
              // fra le due righe di testo. Il click passa attraverso l'overlay
              // (pointer-events-none), quindi resta questa la barra trascinabile.
              className={`${textareaClassName} absolute inset-0 h-full w-full resize-none`}
              style={{ ...effectiveStyle, color: 'transparent', caretColor: 'var(--color-editorial-ink)' }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {textarea}
            <HighlightedText html={resolvedHighlightHtml} style={effectiveStyle} className={`${minHeightClassName} ${textClassName}`} />
          </div>
        )
      ) : null}
      {mode === 'write' && readOnly && usesHighlightOverlay ? (
        <HighlightedText
          ref={readOnlyHighlightRef}
          data-scroll-sync="true"
          html={resolvedHighlightHtml}
          style={effectiveStyle}
          className={fillHeight ? `flex-1 min-h-0 overflow-y-auto custom-scrollbar ${textClassName}` : `${minHeightClassName} ${textClassName}`}
        />
      ) : null}
      {mode === 'write' && readOnly && !usesHighlightOverlay ? readOnlyText : null}
      {mode === 'write' && !readOnly && !usesHighlightOverlay ? textarea : null}
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
                style={effectiveStyle}
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

function ToolbarLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
      {children}
    </span>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-5 w-px bg-editorial-border/80" aria-hidden="true" />;
}
