import { Columns2, FileOutput, Highlighter, Link2, Link2Off, PanelLeft, PanelRight, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useChunksStore } from '../../../stores/chunksStore';
import { useUiStore } from '../../../stores/uiStore';
import { IconButton, SectionLabel } from '../../ui';
import { SidebarSectionShell } from './PipelineSidebarShell';
import { PipelineSidebarExportDialogHost } from './PipelineSidebarExportDialogHost';

export function PipelineSidebarDocumentSection({
  collapsed = false,
  onImportDocument,
}: {
  collapsed?: boolean;
  onImportDocument?: () => void;
}) {
  const { t } = useTranslation();
  const hasDocument = useChunksStore((state) => state.chunks.length > 0);
  const {
    showExportDialog,
    setShowExportDialog,
    documentPaneFocus,
    setDocumentPaneFocus,
    syncScrollEnabled,
    setSyncScrollEnabled,
    highlightsEnabled,
    setHighlightsEnabled,
  } = useUiStore(
    useShallow((state) => ({
      showExportDialog: state.showExportDialog,
      setShowExportDialog: state.setShowExportDialog,
      documentPaneFocus: state.documentPaneFocus,
      setDocumentPaneFocus: state.setDocumentPaneFocus,
      syncScrollEnabled: state.syncScrollEnabled,
      setSyncScrollEnabled: state.setSyncScrollEnabled,
      highlightsEnabled: state.highlightsEnabled,
      setHighlightsEnabled: state.setHighlightsEnabled,
    })),
  );

  const syncScrollDisabled = documentPaneFocus !== 'both';

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-1">
        <Columns2 size={13} className="text-editorial-muted/70" aria-hidden="true" />
        {hasDocument ? (
          <>
            <IconButton size="md" tone={documentPaneFocus === 'both' ? 'accent' : 'default'} onClick={() => setDocumentPaneFocus('both')} title={t('document.focusBoth')} ariaPressed={documentPaneFocus === 'both'} tooltipSide="right" className="h-9 w-9">
              <Columns2 size={14} />
            </IconButton>
            <IconButton size="md" tone={documentPaneFocus === 'source' ? 'accent' : 'default'} onClick={() => setDocumentPaneFocus('source')} title={t('document.focusSource')} ariaPressed={documentPaneFocus === 'source'} tooltipSide="right" className="h-9 w-9">
              <PanelLeft size={14} />
            </IconButton>
            <IconButton size="md" tone={documentPaneFocus === 'translation' ? 'accent' : 'default'} onClick={() => setDocumentPaneFocus('translation')} title={t('document.focusTranslation')} ariaPressed={documentPaneFocus === 'translation'} tooltipSide="right" className="h-9 w-9">
              <PanelRight size={14} />
            </IconButton>
            <IconButton size="md" tone={syncScrollEnabled && !syncScrollDisabled ? 'accent' : 'default'} onClick={() => setSyncScrollEnabled(!syncScrollEnabled)} title={syncScrollEnabled ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')} disabled={syncScrollDisabled} ariaPressed={syncScrollEnabled && !syncScrollDisabled} tooltipSide="right" className="h-9 w-9">
              {syncScrollEnabled && !syncScrollDisabled ? <Link2 size={14} /> : <Link2Off size={14} />}
            </IconButton>
            <IconButton size="md" tone={highlightsEnabled ? 'accent' : 'default'} onClick={() => setHighlightsEnabled(!highlightsEnabled)} title={t('library.glossaryHighlightToggle')} ariaPressed={highlightsEnabled} tooltipSide="right" className="h-9 w-9">
              <Highlighter size={14} />
            </IconButton>
            <IconButton size="md" onClick={() => setShowExportDialog(true)} title={`${t('header.exportLabel')} (Ctrl+E)`} ariaLabel={t('header.exportLabel')} tooltipSide="right" className="h-9 w-9">
              <FileOutput size={14} />
            </IconButton>
          </>
        ) : null}
        <IconButton size="md" onClick={onImportDocument} title={t('files.import')} disabled={!onImportDocument} tooltipSide="right" className="h-9 w-9">
          <Upload size={14} />
        </IconButton>
        <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>
    );
  }

  return (
    <div className="px-2.5">
      <SidebarSectionShell>
        <div className="flex justify-center pb-2">
          <SectionLabel icon={Columns2} label={t('document.panelsTitle')} />
        </div>
        {hasDocument ? (
          <>
            <div className="flex items-center justify-center gap-2">
              <IconButton
                size="md"
                tone={documentPaneFocus === 'both' ? 'accent' : 'default'}
                onClick={() => setDocumentPaneFocus('both')}
                title={t('document.focusBoth')}
                ariaPressed={documentPaneFocus === 'both'}
              >
                <Columns2 size={14} />
              </IconButton>
              <IconButton
                size="md"
                tone={documentPaneFocus === 'source' ? 'accent' : 'default'}
                onClick={() => setDocumentPaneFocus('source')}
                title={t('document.focusSource')}
                ariaPressed={documentPaneFocus === 'source'}
              >
                <PanelLeft size={14} />
              </IconButton>
              <IconButton
                size="md"
                tone={documentPaneFocus === 'translation' ? 'accent' : 'default'}
                onClick={() => setDocumentPaneFocus('translation')}
                title={t('document.focusTranslation')}
                ariaPressed={documentPaneFocus === 'translation'}
              >
                <PanelRight size={14} />
              </IconButton>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 border-t border-editorial-border/40 pt-3">
              <IconButton
                size="md"
                tone={syncScrollEnabled && !syncScrollDisabled ? 'accent' : 'default'}
                onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
                title={syncScrollEnabled ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')}
                disabled={syncScrollDisabled}
                ariaPressed={syncScrollEnabled && !syncScrollDisabled}
              >
                {syncScrollEnabled && !syncScrollDisabled ? <Link2 size={14} /> : <Link2Off size={14} />}
              </IconButton>
              <IconButton
                size="md"
                tone={highlightsEnabled ? 'accent' : 'default'}
                onClick={() => setHighlightsEnabled(!highlightsEnabled)}
                title={t('library.glossaryHighlightToggle')}
                ariaPressed={highlightsEnabled}
              >
                <Highlighter size={14} />
              </IconButton>
              <IconButton
                size="md"
                onClick={() => setShowExportDialog(true)}
                title={`${t('header.exportLabel')} (Ctrl+E)`}
                ariaLabel={t('header.exportLabel')}
              >
                <FileOutput size={14} />
              </IconButton>
            </div>
          </>
        ) : (
          <p className="px-1 text-center text-xs leading-relaxed text-editorial-muted [text-wrap:pretty]">
            {t('projectShell.noDocumentHint')}
          </p>
        )}
        <div className="mt-3 flex items-center justify-center gap-2 border-t border-editorial-border/50 pt-3">
          <IconButton
            size="md"
            onClick={onImportDocument}
            title={t('files.import')}
            disabled={!onImportDocument}
          >
            <Upload size={14} />
          </IconButton>
        </div>
      </SidebarSectionShell>

      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}
