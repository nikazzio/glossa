import { useState } from 'react';
import { BookmarkPlus, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { CatalogSearchField, ClickPopover, IconButton, PopoverItem, RenameField } from '../ui';

const TEMPLATE_PREVIEW_LENGTH = 80;
const TEMPLATE_NAME_MAX_LENGTH = 80;

interface PromptTemplateMenusProps {
  templates: PromptTemplate[];
  value: string;
  onApplyTemplate: (template: PromptTemplate) => void;
  saveTemplate: SaveTemplateFn;
  templateContext: PromptTemplateContext;
  templateWorkflow: PromptTemplateWorkflow;
  defaultModel?: string;
  defaultProvider?: string;
}

/** I due comandi dei modelli di prompt nell'editor comune: il libro apre
 *  l'elenco dei modelli salvati da applicare, il segnalibro il nome con cui
 *  salvare il prompt attuale. Si eliminano nelle risorse linguistiche. */
export function PromptTemplateMenus({
  templates,
  value,
  onApplyTemplate,
  saveTemplate,
  templateContext,
  templateWorkflow,
  defaultModel,
  defaultProvider,
}: PromptTemplateMenusProps) {
  const { t } = useTranslation();
  const [listOpen, setListOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = templates.filter((tmpl) => tmpl.name.toLowerCase().includes(query));

  const openList = (open: boolean) => {
    setListOpen(open);
    if (!open) setSearch('');
  };

  const handleSave = async (name: string) => {
    try {
      await saveTemplate(name, value, templateContext, templateWorkflow, defaultModel, defaultProvider);
      toast.success(t('pipeline.templates.saved'));
      setSaveOpen(false);
    } catch (err: unknown) {
      toast.error(t('pipeline.templates.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <>
      <ClickPopover
        open={saveOpen}
        onOpenChange={setSaveOpen}
        className="w-72 p-2"
        trigger={
          <IconButton size="sm" title={t('pipeline.templates.save')} ariaPressed={saveOpen} disabled={!value.trim()}>
            <BookmarkPlus size={16} />
          </IconButton>
        }
      >
        <RenameField
          initial=""
          label={t('pipeline.templates.namePlaceholder')}
          maxLength={TEMPLATE_NAME_MAX_LENGTH}
          onSave={(name) => void handleSave(name)}
          onCancel={() => setSaveOpen(false)}
        />
      </ClickPopover>
      <ClickPopover
        open={listOpen}
        onOpenChange={openList}
        className="w-80"
        trigger={
          <IconButton size="sm" title={t('pipeline.templates.load')} ariaPressed={listOpen}>
            <BookOpen size={16} />
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
        <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-editorial-muted">{t('pipeline.templates.empty')}</p>
          ) : (
            filtered.map((tmpl) => (
              <div key={tmpl.id} className="flex">
                <PopoverItem
                  label={tmpl.name}
                  description={tmpl.prompt.slice(0, TEMPLATE_PREVIEW_LENGTH)}
                  onSelect={() => {
                    onApplyTemplate(tmpl);
                    openList(false);
                  }}
                />
              </div>
            ))
          )}
        </div>
      </ClickPopover>
    </>
  );
}
