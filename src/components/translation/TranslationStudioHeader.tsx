import { useState } from 'react';
import { BookOpenText, FileOutput, LibraryBig, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, PageHeader, RenameField, Tooltip } from '../ui';
import { confirm } from '../../stores/confirmStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useLanguageLabel } from '../projects/TranslationCatalogRow';
import { PipelineSwitch } from './PipelineSwitch';

interface TranslationStudioHeaderProps {
  onBack: () => void;
  onImportDocument: () => void;
}

const SEPARATOR = <span className="h-1 w-1 shrink-0 rounded-full bg-editorial-border" aria-hidden="true" />;

/** Nome della traduzione, rinominabile sul posto con un clic. */
function TranslationName() {
  const { t } = useTranslation();
  const projectName = useProjectStore(
    (s) => s.projects.find((project) => project.id === s.currentProjectId)?.name ?? '',
  );
  const renameCurrentProject = useProjectStore((s) => s.renameCurrentProject);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <RenameField
        initial={projectName}
        label={t('areas.translations.catalog.renameLabel')}
        onCancel={() => setEditing(false)}
        onSave={(name) => {
          setEditing(false);
          void renameCurrentProject(name).catch((err: unknown) => {
            toast.error(t('areas.translations.catalog.renameFailed'), {
              description: err instanceof Error ? err.message : String(err),
            });
          });
        }}
        className="w-64"
      />
    );
  }

  return (
    <Tooltip label={t('areas.translations.catalog.rename')} side="bottom">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 truncate font-display text-base italic text-editorial-ink transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        {projectName || t('projects.untitled')}
      </button>
    </Tooltip>
  );
}

/**
 * La riga in cima allo Studio di traduzione, come quella dello Studio di
 * trascrizione: a sinistra ritorno al catalogo e nome; al centro la pipeline
 * aperta con le sue opzioni e le sue lingue; a destra i comandi della
 * traduzione intera e le risorse linguistiche del workspace.
 */
export function TranslationStudioHeader({ onBack, onImportDocument }: TranslationStudioHeaderProps) {
  const { t } = useTranslation();
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const hasDocument = useChunksStore((s) => s.chunks.length > 0);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectName = useProjectStore(
    (s) => s.projects.find((project) => project.id === s.currentProjectId)?.name ?? '',
  );
  const removeProject = useProjectStore((s) => s.removeProject);
  const languageLabel = useLanguageLabel();
  const sourceLanguage = usePipelineStore((s) => s.config.sourceLanguage);
  const targetLanguage = usePipelineStore((s) => s.config.targetLanguage);
  const setShowExportDialog = useUiStore((s) => s.setShowExportDialog);
  const setShowLibraryPanel = useLibraryStore((s) => s.setShowLibraryPanel);
  const [removing, setRemoving] = useState(false);

  const removeTranslation = async () => {
    if (!currentProjectId) return;
    const ok = await confirm({
      title: t('projects.confirmDeleteTitle'),
      message: t('projects.confirmDeleteMessage', { name: projectName }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await removeProject(currentProjectId);
      toast.success(t('projects.deleted'));
      onBack();
    } catch (err: unknown) {
      toast.error(t('projects.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRemoving(false);
    }
  };

  /** «Comando — motivo» quando è spento, come negli altri Studi. */
  const blockedTitle = (command: string, reason: string | null) =>
    reason ? t('transcription.commandBlocked', { command, reason }) : command;
  const running = isProcessing ? t('document.reasonRunning') : null;

  return (
    <PageHeader
      area="translations"
      icon={BookOpenText}
      onBack={onBack}
      backLabel={blockedTitle(t('sidebar.backToTranslations'), running)}
      backDisabled={isProcessing}
      title={<TranslationName />}
      center={
        <span className="flex min-w-0 items-center gap-2">
          <PipelineSwitch />
          {SEPARATOR}
          {/* Le lingue sono della pipeline: stanno accanto a lei, intere. */}
          <span className="shrink-0 text-sm text-editorial-ink">
            {languageLabel(sourceLanguage)} → {languageLabel(targetLanguage)}
          </span>
        </span>
      }
      actions={
        <>
          <IconButton
            size="sm"
            onClick={onImportDocument}
            disabled={hasDocument || isProcessing}
            title={blockedTitle(t('files.import'), hasDocument ? t('document.reasonHasDocument') : running)}
            tooltipSide="bottom"
          >
            <Upload size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => setShowExportDialog(true)}
            disabled={!hasDocument}
            title={blockedTitle(t('header.exportLabel'), hasDocument ? null : t('document.reasonNoDocument'))}
            tooltipSide="bottom"
          >
            <FileOutput size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => setShowLibraryPanel(true)}
            title={t('library.openLibrary')}
            tooltipSide="bottom"
          >
            <LibraryBig size={14} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => void removeTranslation()}
            disabled={removing || isProcessing}
            title={blockedTitle(t('projects.delete'), running)}
            tooltipSide="bottom"
          >
            <Trash2 size={14} />
          </IconButton>
        </>
      }
    />
  );
}
