import { BookmarkPlus, BookOpen, Bot, Check, Loader2, Pencil, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { defaultPersonaText } from '../../constants';
import { confirm } from '../../stores/confirmStore';
import type { PromptTemplate } from '../../types';
import { IconButton, SectionLabel } from '../ui';

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
  onDeleteTemplate: (id: string) => Promise<void>;
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
  onDeleteTemplate,
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
      toast.error(t('pipeline.templates.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('library.templateDeleteTitle'),
      message: t('library.templateDeleteMessage', { name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SectionLabel icon={Bot} label={t('pipeline.personaLabel')} />
          {isCustom && (
            <span className="border-l-2 border-l-editorial-accent bg-editorial-accent/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-accent">
              {t('pipeline.personaCustomBadge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <IconButton
                onClick={onRefine}
                disabled={isRefining || !persona?.trim() || !canRefine}
                title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                size="sm"
              >
                {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              </IconButton>
              <IconButton
                onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                title={t('pipeline.templates.save')}
                size="sm"
              >
                <BookmarkPlus size={16} />
              </IconButton>
              <IconButton
                onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                title={t('pipeline.templates.load')}
                size="sm"
              >
                <BookOpen size={16} />
              </IconButton>
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
              {isCustom && (
                <IconButton
                  onClick={handleReset}
                  title={t('pipeline.promptReset')}
                  size="sm"
                >
                  <RotateCcw size={16} />
                </IconButton>
              )}
              <IconButton
                onClick={handleStartEdit}
                title={t('pipeline.personaCustomize')}
                size="sm"
              >
                <Pencil size={16} />
              </IconButton>
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
            aria-label={t('pipeline.templates.namePlaceholder')}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (salva template)
            autoFocus
            className="flex-1 rounded-md bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
          />
          <IconButton
            onClick={handleSaveTemplate}
            disabled={!templateName.trim()}
            title={t('common.confirm')}
            size="sm"
          >
            <Check size={16} />
          </IconButton>
          <IconButton
            onClick={() => { setShowSaveName(false); setTemplateName(''); }}
            title={t('common.cancel')}
            size="sm"
          >
            <X size={16} />
          </IconButton>
        </div>
      )}

      {isEditing && showTemplateList && (
        <div className="border-l-4 border-l-editorial-accent/35 border-y border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-editorial-border/60">
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder={t('pipeline.templates.searchPlaceholder')}
              aria-label={t('pipeline.templates.searchPlaceholder')}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- casella di ricerca che compare aprendo l'elenco template
              autoFocus
              className="w-full rounded-md bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            />
          </div>
          <ul className="max-h-40 overflow-y-auto custom-scrollbar divide-y divide-editorial-border/60">
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
                    <div className="text-xs text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
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
        className={`w-full rounded-md border-2 px-4 py-3 text-[13px] font-mono outline-none leading-6 resize-y ${isEditing ? 'min-h-[10rem] ' : ''}${
          isEditing
            ? 'bg-editorial-paper border-editorial-accent/25 focus-visible:ring-2 focus-visible:ring-editorial-accent'
            : 'bg-editorial-textbox/12 border-editorial-border/40 text-editorial-muted/70 cursor-default'
        }`}
      />
    </div>
  );
}
