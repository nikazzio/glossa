import { reportUiError } from '../../utils/reportUiError';
import { useEffect, useState } from 'react';
import { Brain, Bot, Eye, Languages, LayoutGrid, Minimize2, Pencil, Plus, Scale, ScanText, Trash2, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import type { PromptTemplate, PromptTemplateContext } from '../../types';
import { CatalogSearchField, Hint, IconButton, TabStrip } from '../ui';
import { PromptTemplateForm, templateContextLabel } from './PromptTemplateForm';

const CONTEXTS = ['stage', 'audit', 'persona', 'memory', 'ocr'] as const;
const ICONS = { stage: Languages, audit: Scale, persona: Bot, memory: Brain, ocr: ScanText };

export function PromptTemplatesTab({ onEditingChange, onBusyChange }: { onEditingChange?: (value: boolean) => void; onBusyChange?: (value: boolean) => void } = {}) {
  const { t } = useTranslation();
  const { templates, isLoaded, loadTemplates, saveTemplate, updateTemplate, deleteTemplate } = usePromptTemplateStore();
  const [search, setSearch] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [context, setContext] = useState<PromptTemplateContext | 'all'>('all');
  const [editor, setEditor] = useState<PromptTemplate | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);
  useEffect(() => { onEditingChange?.(editor !== null); return () => onEditingChange?.(false); }, [editor, onEditingChange]);
  useEffect(() => { onBusyChange?.(busy || refining); return () => onBusyChange?.(false); }, [busy, refining, onBusyChange]);
  useEffect(() => {
    if (!isLoaded) void loadTemplates().catch((error: unknown) => {
      reportUiError(t('library.templateLoadError'), error);
    });
  }, [isLoaded, loadTemplates, t]);
  const tabs = [
    { id: 'all', label: t('common.all'), icon: <LayoutGrid size={14} />, disabled: editor !== null || busy || refining },
    ...CONTEXTS.map((id) => {
      const Icon = ICONS[id];
      return { id, label: templateContextLabel(id, t), icon: <Icon size={14} />, disabled: editor !== null || busy || refining };
    }),
  ];
  const filtered = templates.filter((template) =>
    (context === 'all' || template.context === context)
    && `${template.name} ${template.prompt}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const handleSave = async (input: Omit<PromptTemplate, 'id' | 'createdAt'>) => {
    if (busy) return;
    const duplicate = templates.find((template) => template.name === input.name
      && template.context === input.context && template.workflow === input.workflow
      && (editor === 'new' || template.id !== editor?.id));
    if (duplicate) { toast.error(t('library.templateDuplicate')); return; }
    setBusy(true);
    try {
      if (editor && editor !== 'new') await updateTemplate(editor.id, input);
      else await saveTemplate(input.name, input.prompt, input.context, input.workflow, input.defaultModel, input.defaultProvider);
      setEditor(null);
      toast.success(t('pipeline.templates.saved'));
    } catch (error: unknown) {
      reportUiError(t('library.templateSaveError'), error);
    } finally { setBusy(false); }
  };
  const handleDelete = async (template: PromptTemplate) => {
    const ok = await confirm({ title: t('library.templateDeleteTitle'),
      message: t('library.templateDeleteMessage', { name: template.name }),
      confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    setBusy(true);
    try { await deleteTemplate(template.id); toast.success(t('pipeline.templates.deleted')); }
    catch (error: unknown) { reportUiError(t('errors.somethingWentWrong'), error); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TabStrip tabs={tabs} activeId={context} onChange={(id) => setContext(id as typeof context)} ariaLabel={t('library.templateContextLabel')} idPrefix="template-context" />
          <span className="font-display text-sm italic text-editorial-ink">{tabs.find((tab) => tab.id === context)?.label}</span>
        </div>
        <IconButton onClick={() => setEditor('new')} disabled={editor !== null || busy} title={t('library.newTemplate')}><Plus size={14} /></IconButton>
      </div>
      <CatalogSearchField disabled={editor !== null || busy || refining} disabledReason={t('library.searchEditingHint')} value={search} onChange={setSearch} placeholder={t('library.templateSearch')} label={t('library.templateSearch')} />
      {editor === 'new' && <div className="linguistic-resource rounded-md bg-surface-resource p-4"><PromptTemplateForm busy={busy} onSave={handleSave} onCancel={() => setEditor(null)} onRefiningChange={setRefining} /></div>}
      <div id={`template-context-panel-${context}`} role="tabpanel" aria-labelledby={`template-context-tab-${context}`} className="space-y-3">
        {filtered.length === 0 && <p className="py-8 text-center text-sm italic text-editorial-muted">{t('library.noTemplates')}</p>}
        {filtered.map((template) => {
          const ContextIcon = ICONS[template.context];
          const previewOpen = previewId === template.id;
          return <article key={template.id} className="space-y-3 linguistic-resource rounded-md bg-surface-resource p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <h3 className="break-words font-display text-lg italic text-editorial-ink">{template.name}</h3>
                <div className="flex items-center gap-2 text-editorial-muted">
                  <Hint label={templateContextLabel(template.context, t)}><ContextIcon size={13} /></Hint>
                  <Hint label={t(`workflow.${template.workflow}`)}><Workflow size={13} /></Hint>
                  {template.defaultModel && <Hint label={`${template.defaultProvider ?? ''} ${template.defaultModel}`.trim()}><Bot size={13} /></Hint>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton size="sm" onClick={() => setPreviewId(previewOpen ? null : template.id)}
                  aria-expanded={previewOpen} aria-controls={`prompt-preview-${template.id}`} title={t(previewOpen ? 'library.collapsePrompt' : 'library.expandPrompt')}>
                  {previewOpen ? <Minimize2 size={14} /> : <Eye size={14} />}
                </IconButton>
                <IconButton size="sm" onClick={() => setEditor(template)} disabled={editor !== null || busy} title={`${t('common.edit')}: ${template.name}`}><Pencil size={14} /></IconButton>
                <IconButton size="sm" onClick={() => void handleDelete(template)} disabled={editor !== null || busy} title={`${t('common.delete')}: ${template.name}`}><Trash2 size={14} /></IconButton>
              </div>
            </div>
            {editor !== null && editor !== 'new' && editor.id === template.id
              ? <PromptTemplateForm key={template.id} template={template} busy={busy} onSave={handleSave} onCancel={() => setEditor(null)} onRefiningChange={setRefining} />
              : <div>
                <p id={`prompt-preview-${template.id}`} className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-editorial-ink ${previewOpen ? '' : 'line-clamp-3'}`}>{template.prompt}</p>
              </div>}
          </article>; })}
      </div>
    </div>
  );
}
