import { Check, Eye, Loader2, Minimize2, Pencil, RotateCcw, Wand2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider, PromptTemplate, PromptTemplateContext } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { llmService } from '../../services/llmService';
import { FIELD_MONO_CLASSNAME, IconButton } from '../ui';
import { PromptCard } from './PromptCard';
import { PromptTemplateMenus } from './PromptTemplateMenus';
import { PromptSourceLabel } from './PromptSourceLabel';
import { describePromptSource } from './promptSource';

interface PipelinePromptEditorProps {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  templates: PromptTemplate[];
  templateContext: PromptTemplateContext;
  saveTemplate: SaveTemplateFn;
  onConfirm: (text: string, template?: PromptTemplate) => void;
  defaultValue?: string;
  disabledReason?: string;
  provider: ModelProvider;
  model: string;
  canRefine: boolean;
  refineLabel: string;
  refineDisabledReason: string;
  /** Sotto il testo, dentro la stessa carta: impostazioni che riguardano solo questo prompt. */
  footer?: ReactNode;
  /** Il testo non può essere confermato vuoto. */
  required?: boolean;
  /** Segnaposto che il testo deve conservare, per esempio TEXT per {{TEXT}}. */
  requiredPlaceholders?: string[];
  /** Comandi aggiunti prima degli altri, per esempio il lucchetto di un testo di sistema. */
  extraActions?: ReactNode;
}

export function PipelinePromptEditor({ label, hint, value, placeholder, templates, templateContext,
  saveTemplate, onConfirm, defaultValue, disabledReason, provider, model, canRefine, refineLabel,
  refineDisabledReason, footer, required = false, requiredPlaceholders = [], extraActions }: PipelinePromptEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [template, setTemplate] = useState<PromptTemplate | undefined>();
  const [expanded, setExpanded] = useState(false);
  const [refining, setRefining] = useState(false);
  const editing = draft !== null;
  // Senza testo il segnaposto non deve leggersi come contenuto già scritto.
  const isEmpty = !value.trim();
  useEffect(() => { if (editing) editorRef.current?.focus(); }, [editing]);
  const blocked = Boolean(disabledReason) || refining;
  const commandLabel = (command: string) => disabledReason
    ? t('transcription.commandBlocked', { command, reason: disabledReason }) : command;
  const cancel = () => { setDraft(null); setTemplate(undefined); };
  const emptyDraft = required && draft !== null && !draft.trim();
  const missingPlaceholders = draft === null ? [] : requiredPlaceholders.filter((name) => !draft.includes(`{{${name}}}`));
  const confirmReason = emptyDraft
    ? t('pipeline.promptRequired')
    : missingPlaceholders.length
      ? t('pipeline.promptParts.missingPlaceholder', { names: missingPlaceholders.map((name) => `{{${name}}}`).join(', ') })
      : undefined;
  const confirm = () => {
    if (draft === null || blocked || confirmReason) return;
    onConfirm(draft, template);
    cancel();
  };
  const refine = async () => {
    if (draft === null || !draft.trim() || blocked || !canRefine || !model) return;
    setRefining(true);
    try {
      setDraft(await llmService.refinePrompt(draft, provider, model, templateContext));
      toast.success(t('pipeline.refined'));
    } catch (error: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: error instanceof Error ? error.message : String(error) });
    } finally { setRefining(false); }
  };
  const refineCommand = t('pipeline.refinePromptWithModel', { model: refineLabel });

  const source = describePromptSource(draft ?? value, templates, defaultValue);

  return <PromptCard label={label} hint={hint} meta={<PromptSourceLabel source={source} />} actions={editing ? <>
    {extraActions}
    <fieldset disabled={blocked} className="flex items-center gap-1">
      <IconButton size="sm" title={canRefine ? refineCommand : `${refineCommand} — ${refineDisabledReason}`}
        disabled={!canRefine || !draft.trim() || !model} onClick={() => void refine()}>
        {refining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
      </IconButton>
      <PromptTemplateMenus templates={templates} value={draft} templateContext={templateContext}
        templateWorkflow="translation" saveTemplate={saveTemplate} defaultModel={model} defaultProvider={provider}
        onApplyTemplate={(selected) => { setDraft(selected.prompt); setTemplate(selected); editorRef.current?.focus(); }} />
      {defaultValue !== undefined && <IconButton size="sm" title={t('pipeline.promptReset')}
        onClick={() => { setDraft(defaultValue); setTemplate(undefined); }}><RotateCcw size={14} /></IconButton>}
      <IconButton size="sm" disabled={Boolean(confirmReason)}
        title={confirmReason ? t('transcription.commandBlocked', { command: t('common.confirm'), reason: confirmReason }) : commandLabel(t('common.confirm'))}
        onClick={confirm}><Check size={14} /></IconButton>
    </fieldset>
    <IconButton size="sm" title={t('common.cancel')} disabled={refining} onClick={cancel}><X size={14} /></IconButton>
  </> : <>
    {extraActions}
    {!isEmpty && <IconButton size="sm" title={t(expanded ? 'library.collapsePrompt' : 'library.expandPrompt')}
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((open) => !open)}>
      {expanded ? <Minimize2 size={14} /> : <Eye size={14} />}
    </IconButton>}
    <IconButton size="sm" title={commandLabel(t('common.edit'))} disabled={Boolean(disabledReason)}
      onClick={() => { setDraft(value); setTemplate(undefined); }}><Pencil size={14} /></IconButton>
  </>}>
    {editing ? <textarea id={id} ref={editorRef} aria-label={label} value={draft} rows={16}
      placeholder={placeholder} disabled={blocked} className={`${FIELD_MONO_CLASSNAME} resize-y`}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !refining) { event.preventDefault(); event.stopPropagation(); cancel(); }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); confirm(); }
      }} /> : <p id={id} className={`whitespace-pre-wrap break-words font-mono text-sm leading-relaxed ${isEmpty ? 'italic text-editorial-muted' : disabledReason ? 'text-editorial-muted' : 'text-editorial-ink'} ${expanded ? '' : 'line-clamp-12'}`}>
      {value || placeholder}
    </p>}
    {footer}
  </PromptCard>;
}
