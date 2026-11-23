import { useEffect, useId, useRef, useState } from 'react';
import { Check, Eye, FileText, Loader2, Minimize2, Pencil, RotateCcw, Wand2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider, PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../../types';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { llmService } from '../../services/llmService';
import { FIELD_MONO_CLASSNAME, IconButton, SectionLabel } from '../ui';
import { describePromptSource } from '../pipeline/promptSource';
import { PromptTemplateLibrary } from './PromptTemplateLibrary';

export interface PromptRefine {
  provider: ModelProvider;
  model: string;
  /** Perché la rifinitura non si può usare; `null` se si può. */
  blockedReason: string | null;
}

interface PromptPanelProps {
  label: string;
  hint?: string;
  /** Il testo salvato. */
  value: string;
  /** Il testo di partenza, a cui riporta il ripristino. */
  defaultValue: string;
  onSave: (text: string) => void;
  templateContext: PromptTemplateContext;
  templateWorkflow: PromptTemplateWorkflow;
  refine?: PromptRefine;
  /** Bozza tenuta da chi monta il pannello, per farla sopravvivere a un
   *  cambio di scheda; senza, il pannello la tiene da sé. */
  draft?: string | null;
  onDraftChange?: (draft: string | null) => void;
  disabledReason?: string | null;
  /** Un template usato porta con sé anche servizio e modello, se li ha. */
  onTemplateUsed?: (template: PromptTemplate) => void;
}

const PREVIEW_LINES = 'line-clamp-6';

/**
 * Il pannello di un prompt: lettura, modifica in bozza con salva e scarta
 * distinti, provenienza del testo e template. Salvare non crea un template:
 * quello si fa dal menu dei template.
 */
export function PromptPanel({
  label,
  hint,
  value,
  defaultValue,
  onSave,
  templateContext,
  templateWorkflow,
  refine,
  draft: controlledDraft,
  onDraftChange,
  disabledReason = null,
  onTemplateUsed,
}: PromptPanelProps) {
  const { t } = useTranslation();
  const id = useId();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const templates = usePromptTemplateStore((state) => state.templates);
  const isLoaded = usePromptTemplateStore((state) => state.isLoaded);
  const loadTemplates = usePromptTemplateStore((state) => state.loadTemplates);
  const [ownDraft, setOwnDraft] = useState<string | null>(null);
  const [baseTemplateId, setBaseTemplateId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [refining, setRefining] = useState(false);

  const controlled = onDraftChange !== undefined;
  const draft = controlled ? controlledDraft ?? null : ownDraft;
  const setDraft = (next: string | null) => (controlled ? onDraftChange(next) : setOwnDraft(next));
  const editing = draft !== null;
  const scoped = templates.filter((template) => template.context === templateContext);
  const shownText = value || defaultValue;

  useEffect(() => {
    if (!isLoaded) void loadTemplates();
  }, [isLoaded, loadTemplates]);
  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  // Il template di partenza: quello applicato, o quello che il testo salvato
  // ripete quando si apre la modifica (anche in una bozza ripresa).
  const matching = (text: string) => scoped.find((template) => template.prompt.trim() === text.trim()) ?? null;
  const base = scoped.find((template) => template.id === baseTemplateId) ?? (editing ? matching(shownText) : null);

  const sourceLabel = (() => {
    if (!editing) {
      const source = describePromptSource(shownText, scoped, defaultValue);
      return source.kind === 'template'
        ? t('pipeline.promptSource.template', { name: source.name })
        : source.kind === 'empty' ? '' : t(`pipeline.promptSource.${source.kind}`);
    }
    const unsaved = draft.trim() !== shownText.trim() ? ` · ${t('promptPanel.unsaved')}` : '';
    if (base && draft.trim() === base.prompt.trim()) return `${t('pipeline.promptSource.template', { name: base.name })}${unsaved}`;
    if (base) return `${t('promptPanel.templateModified', { name: base.name })}${unsaved}`;
    const source = describePromptSource(draft, scoped, defaultValue);
    const text = source.kind === 'template'
      ? t('pipeline.promptSource.template', { name: source.name })
      : source.kind === 'empty' ? '' : t(`pipeline.promptSource.${source.kind}`);
    return `${text}${unsaved}`;
  })();

  const discard = () => {
    setDraft(null);
    setBaseTemplateId(null);
  };
  const save = () => {
    if (draft === null || refining || !draft.trim()) return;
    onSave(draft);
    discard();
  };
  const useTemplate = (template: PromptTemplate) => {
    setDraft(template.prompt);
    setBaseTemplateId(template.id);
    onTemplateUsed?.(template);
    editorRef.current?.focus();
  };
  const runRefine = async () => {
    if (draft === null || !refine || refine.blockedReason || !draft.trim()) return;
    setRefining(true);
    try {
      setDraft(await llmService.refinePrompt(draft, refine.provider, refine.model, templateContext));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefining(false);
    }
  };

  const blocked = (command: string) => (disabledReason ? t('transcription.commandBlocked', { command, reason: disabledReason }) : command);
  const refineCommand = refine ? t('pipeline.refinePromptWithModel', { model: `${refine.provider} · ${refine.model}` }) : '';

  return (
    <section className="space-y-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2 border-b border-rule pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <SectionLabel icon={FileText} label={label} hint={hint} />
          {sourceLabel ? <span className="min-w-0 truncate text-xs text-editorial-muted" title={sourceLabel}>{sourceLabel}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              {refine ? (
                <IconButton
                  size="sm"
                  onClick={() => void runRefine()}
                  disabled={refining || !draft.trim() || refine.blockedReason !== null}
                  title={refine.blockedReason ? t('transcription.commandBlocked', { command: refineCommand, reason: refine.blockedReason }) : refineCommand}
                >
                  {refining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                </IconButton>
              ) : null}
              <PromptTemplateLibrary
                context={templateContext}
                workflow={templateWorkflow}
                text={draft}
                onUse={useTemplate}
                defaultModel={refine?.model}
                defaultProvider={refine?.provider}
              />
              <IconButton size="sm" onClick={() => { setDraft(defaultValue); setBaseTemplateId(null); }} title={t('promptPanel.resetDraft')}>
                <RotateCcw size={14} />
              </IconButton>
              <IconButton size="sm" onClick={save} disabled={refining || !draft.trim()} title={t('promptPanel.save')}>
                <Check size={14} />
              </IconButton>
              <IconButton size="sm" onClick={discard} disabled={refining} title={t('promptPanel.discard')}>
                <X size={14} />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton size="sm" onClick={() => setExpanded((open) => !open)} title={t(expanded ? 'library.collapsePrompt' : 'library.expandPrompt')} ariaPressed={expanded}>
                {expanded ? <Minimize2 size={14} /> : <Eye size={14} />}
              </IconButton>
              <IconButton size="sm" onClick={() => setDraft(shownText)} disabled={Boolean(disabledReason)} title={blocked(t('pipeline.editPrompt'))}>
                <Pencil size={14} />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          id={id}
          ref={editorRef}
          aria-label={label}
          value={draft}
          rows={16}
          disabled={refining}
          className={`${FIELD_MONO_CLASSNAME} w-full resize-y text-xs leading-6`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !refining) {
              event.preventDefault();
              event.stopPropagation();
              discard();
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.stopPropagation();
              save();
            }
          }}
        />
      ) : (
        <p id={id} className={`whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-editorial-ink ${expanded ? '' : PREVIEW_LINES}`}>
          {shownText}
        </p>
      )}
    </section>
  );
}
