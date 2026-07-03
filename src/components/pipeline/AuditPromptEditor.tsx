import { BookmarkPlus, BookOpen, Check, Loader2, Pencil, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PromptTemplate } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';

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
  onDeleteTemplate: (id: string) => Promise<void>;
  defaultModel?: string;
  defaultProvider?: string;
  icon?: ReactNode;
  defaultValue?: string;
  onReset?: () => void;
}

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
  onDeleteTemplate,
  defaultModel,
  defaultProvider,
  icon,
  defaultValue,
  onReset,
}: AuditPromptEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const isCustomPrompt = !!defaultValue && value.trim() !== defaultValue.trim();

  const handleCloseEdit = () => {
    setIsEditing(false);
    setShowSaveName(false);
    setShowTemplateList(false);
    setTemplateName('');
  };

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, value, 'audit', 'translation', defaultModel, defaultProvider);
      toast.success(t('pipeline.templates.saved'));
      setTemplateName('');
      setShowSaveName(false);
    } catch (err: unknown) {
      toast.error(t('pipeline.templates.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await onDeleteTemplate(id);
      toast.success(t('pipeline.templates.deleted'));
    } catch (err: unknown) {
      toast.error(t('pipeline.templates.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="border-l-4 border-l-editorial-warning/45 border-y border-editorial-border/70 bg-editorial-bg/85 px-5 py-4 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {icon && <span className="text-editorial-accent shrink-0">{icon}</span>}
            <span className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-editorial-muted">{label}</span>
            {isCustomPrompt && (
              <span className="border-l-2 border-l-editorial-accent bg-editorial-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-editorial-accent">
                {t('pipeline.promptCustomBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onRefine}
                  disabled={isRefining || !value.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  aria-label={`${t('pipeline.refinePromptWithModel', { model: refineLabel })}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                  title={t('pipeline.templates.save')}
                  aria-label={`${t('pipeline.templates.save')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookmarkPlus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                  title={t('pipeline.templates.load')}
                  aria-label={`${t('pipeline.templates.load')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookOpen size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  title={t('common.close')}
                  aria-label={`${t('common.close')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                {isCustomPrompt && onReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    title={t('pipeline.promptReset')}
                    aria-label={`${t('pipeline.promptReset')}: ${label}`}
                    className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  title={t('pipeline.editPrompt')}
                  aria-label={`${t('pipeline.editPrompt')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <Pencil size={16} />
                </button>
              </>
            )}
          </div>
        </div>
        {hint && (
          <p className="text-xs leading-relaxed text-editorial-muted/70">{hint}</p>
        )}
      </div>

      {showSaveName && (
        <div className="flex items-center gap-1.5">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTemplate();
              if (e.key === 'Escape') setShowSaveName(false);
            }}
            placeholder={t('pipeline.templates.namePlaceholder')}
            autoFocus
            className="flex-1 rounded-md bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={!templateName.trim()}
            className="text-editorial-ink hover:text-editorial-accent transition-colors disabled:opacity-40 focus:outline-none"
            aria-label={t('common.confirm')}
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={() => { setShowSaveName(false); setTemplateName(''); }}
            className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showTemplateList && (
        <div className="border-y border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-editorial-border/60">
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder={t('pipeline.templates.searchPlaceholder')}
              autoFocus
              className="w-full rounded-md bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-editorial-border/60">
            {filteredTemplates.length === 0 ? (
              <li className="px-3 py-4 text-xs text-editorial-muted text-center">
                {t('pipeline.templates.empty')}
              </li>
            ) : (
              filteredTemplates.map((tmpl) => (
                <li
                  key={tmpl.id}
                  className="flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40 group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApplyTemplate(tmpl);
                      setShowTemplateList(false);
                      setTemplateSearch('');
                    }}
                    className="flex-1 text-left min-w-0 focus:outline-none"
                  >
                    <div className="text-sm font-bold text-editorial-ink truncate">{tmpl.name}</div>
                    <div className="text-xs text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="shrink-0 text-editorial-muted/40 hover:text-editorial-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none mt-0.5"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={!isEditing}
        rows={isEditing ? 12 : 4}
        className={`w-full rounded-md border-2 p-4 text-[13px] font-mono outline-none leading-6 resize-y min-h-[12rem] ${
          isEditing
            ? 'bg-editorial-paper border-editorial-warning/25 focus-visible:ring-2 focus-visible:ring-editorial-accent'
            : 'bg-editorial-textbox/12 border-editorial-border/40 text-editorial-muted/70 cursor-default'
        }`}
      />
    </div>
  );
}
