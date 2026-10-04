import { useEffect, useState } from 'react';
import { LibraryBig, Loader2, Save, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { resolveDeeplLanguages } from '../../pipeline/deeplConfig';
import { assignGlossaryToProject, upsertGlossaryEntries } from '../../services/glossaryService';
import { deeplService } from '../../services/deeplService';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { DictionaryEntryEditor } from '../library/DictionaryEntryEditor';
import { IconButton, PanelSection, Select } from '../ui';

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Glossario: il dizionario del workspace assegnato alla pipeline, i suoi
 *  termini da modificare qui e, in modalità DeepL, il caricamento su DeepL. */
export function GlossaryTabPanel() {
  const { t } = useTranslation();
  const { config, setConfig, assignGlossary } = usePipelineStore();
  const { glossaries, setShowLibraryPanel, loadGlossaries } = useLibraryStore();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? null);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const deeplStage = config.stages.find((stage) => stage.enabled && stage.provider === 'deepl');
  const deeplLanguages = deeplStage ? resolveDeeplLanguages(deeplStage) : undefined;

  useEffect(() => {
    loadGlossaries(activeWorkspaceId);
  }, [activeWorkspaceId, loadGlossaries]);

  useEffect(() => {
    setIsDirty(false);
  }, [config.assignedGlossaryId]);

  const handleAssign = async (glossaryId: string) => {
    try {
      if (currentProjectId) await assignGlossaryToProject(currentProjectId, glossaryId || null);
      await assignGlossary(glossaryId || null);
    } catch (err: unknown) {
      toast.error(t('library.dictionaryAssignError'), { description: errorText(err) });
    }
  };

  const handleSave = async () => {
    if (!config.assignedGlossaryId) return;
    setIsSaving(true);
    try {
      await upsertGlossaryEntries(config.assignedGlossaryId, config.glossary);
      setIsDirty(false);
      toast.success(t('library.dictionarySaved'));
    } catch (err: unknown) {
      toast.error(t('library.dictionarySaveError'), { description: errorText(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadToDeepL = async () => {
    if (config.glossary.length === 0 || !deeplLanguages?.sourceLang || !deeplLanguages.targetLang) return;
    setIsUploading(true);
    try {
      await deeplService.createGlossary({
        name: config.assignedGlossaryId ?? 'Glossa',
        ...deeplLanguages,
        entries: config.glossary.map((e) => ({ source: e.term, target: e.translation })),
      });
      toast.success(t('pipeline.deepl.glossaryUploaded'));
    } catch (err: unknown) {
      toast.error(t('pipeline.deepl.glossaryUploadFailed'), { description: errorText(err) });
    } finally {
      setIsUploading(false);
    }
  };

  const canUploadToDeepL = Boolean(deeplStage) && config.glossary.length > 0;

  return (
    <div id="pconfig-panel-glossary" role="tabpanel" aria-labelledby="pconfig-tab-glossary" className="space-y-8">
      <PanelSection
        icon={LibraryBig}
        label={t('library.assignedDictionary')}
        actions={
          <span className="flex items-center gap-1">
            {config.assignedGlossaryId && (
              <IconButton
                size="sm"
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                title={isDirty
                  ? t('pipeline.glossarySave')
                  : t('transcription.commandBlocked', { command: t('pipeline.glossarySave'), reason: t('pipeline.reasonNoChanges') })}
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              </IconButton>
            )}
            {canUploadToDeepL && (
              <IconButton
                size="sm"
                onClick={() => void handleUploadToDeepL()}
                disabled={isUploading || !deeplLanguages?.sourceLang || !deeplLanguages.targetLang}
                title={deeplLanguages?.sourceLang ? t('pipeline.deepl.uploadGlossaryTooltip') : t('pipeline.deepl.glossaryNeedsSource')}
              >
                {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              </IconButton>
            )}
            <IconButton
              size="sm"
              onClick={() => setShowLibraryPanel(true, 'dictionaries')}
              title={t('library.openLibrary')}
            >
              <LibraryBig size={13} />
            </IconButton>
          </span>
        }
      >
        <Select
          value={config.assignedGlossaryId ?? ''}
          onChange={(value) => void handleAssign(value)}
          size="md"
          className="w-full"
          ariaLabel={t('library.assignedDictionary')}
          options={[
            { value: '', label: t('library.noDictionaryAssigned') },
            ...glossaries.map((g) => ({ value: g.id, label: g.name })),
          ]}
        />
        {config.assignedGlossaryId && (
          <DictionaryEntryEditor
            entries={config.glossary}
            onChange={(entries) => {
              setConfig((prev) => ({ ...prev, glossary: entries }));
              setIsDirty(true);
            }}
          />
        )}
      </PanelSection>
    </div>
  );
}
