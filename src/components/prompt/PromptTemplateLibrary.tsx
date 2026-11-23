import { useState } from 'react';
import { BookOpen, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../../types';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { CatalogSearchField, ClickPopover, IconButton, PopoverItem, RenameField } from '../ui';

const PREVIEW_LENGTH = 80;
const NAME_MAX_LENGTH = 80;

interface PromptTemplateLibraryProps {
  context: PromptTemplateContext;
  workflow: PromptTemplateWorkflow;
  /** Il testo attuale del pannello: si salva come nuovo template o ne aggiorna uno. */
  text: string;
  onUse: (template: PromptTemplate) => void;
  defaultModel?: string;
  defaultProvider?: string;
}

function reportFailure(message: string, err: unknown) {
  toast.error(message, { description: err instanceof Error ? err.message : String(err) });
}

/**
 * I template di prompt di una categoria, tutti da un solo menu: usa,
 * aggiorna con il testo attuale, elimina (con conferma nella riga), salva il
 * testo attuale come nuovo template.
 */
export function PromptTemplateLibrary({ context, workflow, text, onUse, defaultModel, defaultProvider }: PromptTemplateLibraryProps) {
  const { t } = useTranslation();
  const templates = usePromptTemplateStore((state) => state.templates);
  const saveTemplate = usePromptTemplateStore((state) => state.saveTemplate);
  const updateTemplate = usePromptTemplateStore((state) => state.updateTemplate);
  const deleteTemplate = usePromptTemplateStore((state) => state.deleteTemplate);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [naming, setNaming] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const shown = templates
    .filter((template) => template.context === context)
    .filter((template) => template.name.toLowerCase().includes(query));
  const hasText = text.trim() !== '';

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSearch('');
      setNaming(false);
      setConfirmingId(null);
    }
  };

  const saveNew = async (name: string) => {
    try {
      await saveTemplate(name, text, context, workflow, defaultModel, defaultProvider);
      toast.success(t('pipeline.templates.saved'));
      setNaming(false);
    } catch (err: unknown) {
      reportFailure(t('pipeline.templates.saveFailed'), err);
    }
  };

  const update = async (template: PromptTemplate) => {
    try {
      await updateTemplate(template.id, {
        name: template.name,
        prompt: text,
        context: template.context,
        workflow: template.workflow,
        defaultModel: template.defaultModel,
        defaultProvider: template.defaultProvider,
      });
      toast.success(t('promptPanel.templateUpdated', { name: template.name }));
    } catch (err: unknown) {
      reportFailure(t('pipeline.templates.saveFailed'), err);
    }
  };

  const remove = async (template: PromptTemplate) => {
    try {
      await deleteTemplate(template.id);
      toast.success(t('pipeline.templates.deleted'));
    } catch (err: unknown) {
      reportFailure(t('promptPanel.deleteFailed'), err);
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <ClickPopover
      open={open}
      onOpenChange={changeOpen}
      className="w-80"
      trigger={
        <IconButton size="sm" title={t('promptPanel.templates')} ariaPressed={open}>
          <BookOpen size={14} />
        </IconButton>
      }
    >
      <div className="border-b border-rule p-2">
        <CatalogSearchField
          value={search}
          onChange={setSearch}
          placeholder={t('pipeline.templates.searchPlaceholder')}
          label={t('pipeline.templates.searchPlaceholder')}
          focusOnMount
        />
      </div>
      <ul className="max-h-64 overflow-y-auto p-1 custom-scrollbar" aria-label={t('promptPanel.templates')}>
        {shown.length === 0 ? (
          <li className="px-3 py-3 text-center text-xs text-editorial-muted">{t('pipeline.templates.empty')}</li>
        ) : shown.map((template) => (
          <li key={template.id} className="group flex items-center gap-1">
            <PopoverItem
              label={template.name}
              description={template.prompt.slice(0, PREVIEW_LENGTH)}
              onSelect={() => {
                onUse(template);
                changeOpen(false);
              }}
            />
            {confirmingId === template.id ? (
              <span className="flex shrink-0 items-center gap-1 pr-1">
                <IconButton size="xs" tone="danger" onClick={() => void remove(template)} title={t('promptPanel.confirmDelete', { name: template.name })}>
                  <Trash2 size={11} />
                </IconButton>
                <IconButton size="xs" onClick={() => setConfirmingId(null)} title={t('common.cancel')}>
                  <X size={11} />
                </IconButton>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 pr-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <IconButton size="xs" onClick={() => void update(template)} disabled={!hasText} title={t('promptPanel.updateTemplate', { name: template.name })}>
                  <RefreshCw size={11} />
                </IconButton>
                <IconButton size="xs" onClick={() => setConfirmingId(template.id)} title={t('promptPanel.deleteTemplate', { name: template.name })}>
                  <Trash2 size={11} />
                </IconButton>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-rule p-2">
        {naming ? (
          <RenameField
            initial=""
            label={t('pipeline.templates.namePlaceholder')}
            maxLength={NAME_MAX_LENGTH}
            onSave={(name) => void saveNew(name)}
            onCancel={() => setNaming(false)}
          />
        ) : (
          <IconButton size="sm" onClick={() => setNaming(true)} disabled={!hasText} title={t('promptPanel.saveAsTemplate')}>
            <Plus size={14} />
          </IconButton>
        )}
      </div>
    </ClickPopover>
  );
}
