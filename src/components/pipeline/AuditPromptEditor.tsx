import { FileText, Loader2, Pencil, RotateCcw, Wand2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PromptSourceLabel } from './PromptSourceLabel';
import { describePromptSource } from './promptSource';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { IconButton, FieldLabel, SectionLabel } from '../ui';
import { PromptTemplateMenus } from './PromptTemplateMenus';

export interface AuditPromptEditorProps {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  templates: PromptTemplate[];
  isRefining: boolean;
  canRefine: boolean;
  refineLabel: string;
  onRefine: () => void;
  onChange: (value: string) => void;
  onApplyTemplate: (template: PromptTemplate) => void;
  saveTemplate: SaveTemplateFn;
  defaultModel?: string;
  defaultProvider?: string;
  icon?: ReactNode;
  defaultValue?: string;
  onReset?: () => void;
  /** Contesto/flusso con cui il template si salva: giudizio traduzione per
   *  default (unico caso storico), OCR/HTR per la scheda Assistenza (#220). */
  templateContext?: PromptTemplateContext;
  templateWorkflow?: PromptTemplateWorkflow;
  /** `stage`: stessa resa della sezione prompt della scheda traduzione
   *  (bordo verde, etichetta di sezione, «Personalizzato» a pillola). */
  variant?: 'audit' | 'stage';
  /** Modifica e ripristino spenti, con il motivo nel suggerimento (fase con
   *  traduzioni già fatte, pipeline in esecuzione). */
  editDisabledReason?: string;
  /** Perché la rifinitura non si può usare (chiave del fornitore mancante). */
  refineDisabledReason?: string;
}

const VARIANT_STYLES = {
  audit: {
    card: 'border-l-editorial-warning/45',
    editing: 'border-editorial-warning/25',
  },
  stage: {
    card: 'border-l-editorial-accent/40',
    editing: 'border-editorial-accent/25',
  },
} as const;

export function AuditPromptEditor({
  label,
  hint,
  value,
  placeholder,
  templates,
  isRefining,
  canRefine,
  refineLabel,
  onRefine,
  onChange,
  onApplyTemplate,
  saveTemplate,
  defaultModel,
  defaultProvider,
  icon,
  defaultValue,
  onReset,
  templateContext = 'audit',
  templateWorkflow = 'translation',
  variant = 'audit',
  editDisabledReason,
  refineDisabledReason,
}: AuditPromptEditorProps) {
  const styles = VARIANT_STYLES[variant];
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const isCustomPrompt = !!defaultValue && value.trim() !== defaultValue.trim();
  const source = describePromptSource(value, templates, defaultValue);
  const blocked = (command: string, reason: string | undefined) =>
    reason ? t('transcription.commandBlocked', { command, reason }) : command;
  const refineCommand = t('pipeline.refinePromptWithModel', { model: refineLabel });

  const handleCloseEdit = () => setIsEditing(false);

  return (
    <div className={`border-l-4 ${styles.card} border-y border-rule bg-editorial-bg/85 px-5 py-4 space-y-3`}>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {variant === 'stage' ? (
              <SectionLabel icon={FileText} label={label} hint={hint || undefined} />
            ) : (
              <FieldLabel icon={icon && <span className="text-editorial-accent shrink-0">{icon}</span>} hint={hint || undefined}>
                {label}
              </FieldLabel>
            )}
            <PromptSourceLabel source={source} />
          </div>
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <IconButton
                  onClick={onRefine}
                  disabled={isRefining || !value.trim() || !canRefine}
                  title={canRefine ? refineCommand : blocked(refineCommand, refineDisabledReason)}
                  size="sm"
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </IconButton>
                <PromptTemplateMenus
                  templates={templates}
                  value={value}
                  onApplyTemplate={onApplyTemplate}
                  saveTemplate={saveTemplate}
                  templateContext={templateContext}
                  templateWorkflow={templateWorkflow}
                  defaultModel={defaultModel}
                  defaultProvider={defaultProvider}
                />
                <IconButton
                  onClick={handleCloseEdit}
                  title={t('common.close')}
                  size="sm"
                >
                  <X size={16} />
                </IconButton>
              </>
            ) : (
              <>
                {isCustomPrompt && onReset && (
                  <IconButton
                    onClick={onReset}
                    disabled={Boolean(editDisabledReason)}
                    title={blocked(t('pipeline.promptReset'), editDisabledReason)}
                    size="sm"
                  >
                    <RotateCcw size={16} />
                  </IconButton>
                )}
                <IconButton
                  onClick={() => setIsEditing(true)}
                  disabled={Boolean(editDisabledReason)}
                  title={blocked(t('pipeline.editPrompt'), editDisabledReason)}
                  size="sm"
                >
                  <Pencil size={16} />
                </IconButton>
              </>
            )}
          </div>
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={!isEditing || Boolean(editDisabledReason)}
        rows={isEditing ? 16 : 4}
        className={`w-full rounded-md border-2 p-4 text-xs font-mono outline-none leading-6 resize-y min-h-[12rem] ${
          isEditing
            ? `bg-editorial-paper ${styles.editing} focus-visible:ring-2 focus-visible:ring-editorial-accent`
            : 'bg-editorial-textbox/12 border-rule-faint text-editorial-muted/70 cursor-default'
        }`}
      />
    </div>
  );
}
