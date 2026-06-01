import { BookmarkPlus, BookOpen, Bot, Check, Loader2, Pencil, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { defaultPersonaText } from '../../constants';
import type { PromptTemplate } from '../../types';
import { SectionLabel } from '../ui';

export interface PersonaEditorProps {
  persona: string | undefined;
  sourceLanguage: string;
  targetLanguage: string;
  templates: PromptTemplate[];
  isRefining: boolean;
  canRefine: boolean;
  refineLabel: string;
  onChange: (value: string | undefined) => void;
  onRefine: () => void;
  onSaveTemplate: (name: string, prompt: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

export function PersonaEditor({
  persona,
  sourceLanguage,
  targetLanguage,
  templates,
  isRefining,
  canRefine,
  refineLabel,
  onChange,
  onRefine,
  onSaveTemplate,
  deleteTemplate,
}: PersonaEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const isCustom = !!persona?.trim();
  const defaultText = defaultPersonaText(sourceLanguage, targetLanguage);

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleStartEdit = () => {
    if (!isCustom) onChange(defaultText);
    setIsEditing(true);
  };
  const handleCloseEdit = () => {
    setIsEditing(false);
    setShowSaveName(false);
    setShowTemplateList(false);
    setTemplateName('');
  };
  const handleReset = () => {
    onChange(undefined);
    setIsEditing(false);
    setShowSaveName(false);
    setShowTemplateList(false);
    setTemplateName('');
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name || !persona) return;
    try {
      await onSaveTemplate(name, persona);
      toast.success(t('pipeline.templates.saved'));
      setTemplateName('');
      setShowSaveName(false);
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast.success(t('pipeline.templates.deleted'));
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SectionLabel icon={Bot} label={t('pipeline.personaLabel')} />
          {isCustom && (
            <span className="rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-editorial-accent">
              {t('pipeline.personaCustomBadge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={onRefine}
                disabled={isRefining || !persona?.trim() || !canRefine}
                title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                aria-label={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
              >
                {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                title={t('pipeline.templates.save')}
                aria-label={t('pipeline.templates.save')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <BookmarkPlus size={14} />
              </button>
              <button
                type="button"
                onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                title={t('pipeline.templates.load')}
                aria-label={t('pipeline.templates.load')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <BookOpen size={14} />
              </button>
              <button
                type="button"
                onClick={handleCloseEdit}
                title={t('common.close')}
                aria-label={t('common.close')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              {isCustom && (
                <button
                  type="button"
                  onClick={handleReset}
                  title={t('pipeline.promptReset')}
                  aria-label={t('pipeline.promptReset')}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={handleStartEdit}
                title={t('pipeline.personaCustomize')}
                aria-label={t('pipeline.personaCustomize')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <Pencil size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing && showSaveName && (
        <div className="flex items-center gap-1.5">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTemplate();
              if (e.key === 'Escape') { setShowSaveName(false); setTemplateName(''); }
            }}
            placeholder={t('pipeline.templates.namePlaceholder')}
            autoFocus
            className="flex-1 rounded bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
          />
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={!templateName.trim()}
            className="text-editorial-ink hover:text-editorial-accent transition-colors disabled:opacity-40 focus:outline-none"
            aria-label={t('common.confirm')}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setShowSaveName(false); setTemplateName(''); }}
            className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
            aria-label={t('common.cancel')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isEditing && showTemplateList && (
        <div className="rounded-lg border border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-editorial-border/60">
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder={t('pipeline.templates.searchPlaceholder')}
              autoFocus
              className="w-full rounded bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            />
          </div>
          <ul className="max-h-40 overflow-y-auto custom-scrollbar">
            {filteredTemplates.length === 0 ? (
              <li className="px-3 py-3 text-xs text-editorial-muted text-center">
                {t('pipeline.templates.empty')}
              </li>
            ) : (
              filteredTemplates.map((tmpl) => (
                <li key={tmpl.id} className="flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40 group">
                  <button
                    type="button"
                    onClick={() => { onChange(tmpl.prompt); setShowTemplateList(false); setTemplateSearch(''); }}
                    className="flex-1 text-left min-w-0 focus:outline-none"
                  >
                    <div className="text-xs font-bold text-editorial-ink truncate">{tmpl.name}</div>
                    <div className="text-[10px] text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="shrink-0 text-editorial-muted/40 hover:text-editorial-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none mt-0.5"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <textarea
        value={isCustom ? persona : defaultText}
        disabled={!isEditing}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
        rows={isEditing ? 12 : isCustom ? 4 : 2}
        className={`w-full rounded-[14px] border px-3 py-2 text-xs font-mono outline-none leading-relaxed resize-y ${isEditing ? 'min-h-[10rem] ' : ''}${
          isEditing
            ? 'bg-editorial-textbox/40 border-editorial-border/60 focus-visible:ring-2 focus-visible:ring-editorial-accent'
            : 'bg-editorial-textbox/10 border-editorial-border/30 text-editorial-muted/60 cursor-default'
        }`}
      />
    </div>
  );
}
