import { useEffect, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { MarkdownEditor, PagePendingOverlay } from '../common';
import { INSPECTOR_WIDTH, ResizeHandle } from '../ui';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useTranscriptionStore } from '../../stores/transcriptionStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useTranscriptionSources } from './useTranscriptionSources';
import { TranscriptionInspector, type TranscriptionInspectorTab } from './TranscriptionInspector';
import { useSegmentEditor } from './useSegmentEditor';
import { useRevisionActions } from './useRevisionActions';
import { useStudioOcr } from './useStudioOcr';
import { useViewerSync } from './useViewerSync';
import { TEXT_MIN, VIEWER_MAX, VIEWER_MIN, useInspectorLayout } from './useInspectorLayout';
import { useSaveShortcut } from './useSaveShortcut';
import { formatRevisionDate } from './formatRevisionDate';
import { StudioPageHeader } from './StudioPageHeader';
import { StudioViewerPane } from './StudioViewerPane';
import { StudioTextHeader } from './StudioTextHeader';

interface TranscriptionStudioProps {
  documentId: string;
  onBack: () => void;
}

/**
 * Studio di trascrizione (#388): visore a sinistra — zoom/pan della pagina
 * collegata; un documento nato senza digitalizzazione mostra un avviso al
 * posto suo — testo al centro, strumenti a destra.
 *
 * **Un segmento per pagina**, non uno per documento: cambiare pagina nel
 * visore cambia il testo mostrato, ancorato a quella posizione
 * (`transcription_segments.position`; `source_page_id` si aggiunge da sé al
 * primo tocco del segmento dopo che un lavoro di scaricamento ha popolato
 * `source_pages`). L'OCR (#220) non aspetta quel collegamento: gli basta la
 * copia che il visore sta già mostrando.
 */
export function TranscriptionStudio({ documentId, onBack }: TranscriptionStudioProps) {
  const { t, i18n } = useTranslation();
  const detail = useTranscriptionStore((s) => s.detail);
  const loadDetail = useTranscriptionStore((s) => s.loadDetail);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const [activeTab, setActiveTab] = useState<TranscriptionInspectorTab>('history');
  const [textMenuOpen, setTextMenuOpen] = useState(false);

  useEffect(() => {
    void loadDetail(documentId);
  }, [documentId, loadDetail]);

  const sources = useTranscriptionSources(detail?.source_version_id ?? null);
  const editor = useSegmentEditor(documentId);
  const revisionActions = useRevisionActions(editor, documentId, detail);
  const ocr = useStudioOcr({ editor, documentId, detail, workspace: activeWorkspace, viewerRef: sources.viewerRef });
  const sync = useViewerSync({
    activeSource: sources.activeSource,
    setActiveSource: sources.setActiveSource,
    manualUnlinked: sources.manualUnlinked,
    siblingPageCount: sources.siblingPageCount,
    pageIndex: editor.pageIndex,
    pageTotal: editor.pageTotal,
  });
  const layout = useInspectorLayout();
  const { segment, draft, pageIndex, pageTotal, pendingStatus, saveState } = editor;

  // Fuori sincronia il visore sfoglia per conto suo: i suoi eventi non
  // toccano più la pagina di testo, che si sposta solo con le frecce
  // indipendenti.
  const handleViewerPageChange = (index: number, label: string | null, total: number | null) => {
    if (sync.synced) editor.goToViewerPage(index, label, total);
  };

  const isVerified = Boolean(segment?.approved_revision_id);
  // Il numero mostrato segue subito la pagina scelta, non quella ancora
  // confermata: la stessa convenzione della scheda opera in Biblioteca. Fuori
  // sincronia il visore sfoglia per conto suo: il suo stato di caricamento
  // non riguarda più la pagina di testo mostrata qui.
  const displayIndex = sync.synced ? pendingStatus?.index ?? pageIndex : pageIndex;
  const isPagePending = editor.loadingSegment || (sync.synced && pendingStatus?.state === 'loading');
  // Questa pagina è dentro un lavoro di lettura in corso: il foglio si vela e
  // resta in sola lettura, perché scrivere su un testo che sta per essere
  // sostituito è lavoro buttato.
  const isPageReading = ocr.activity.isReading(segment?.id);
  // La prima pagina in lettura del documento, anche se non è quella aperta:
  // sfogliare avanti non deve far sparire il segnale.
  const readingPage = ocr.activity.pages[0] ?? null;
  const pagePendingError = sync.synced && pendingStatus?.state === 'error' ? pendingStatus.message : null;
  const isTextReadOnly = isVerified || isPageReading || isPagePending || Boolean(pagePendingError);
  const hasUnsavedText = saveState === 'pending' || saveState === 'error';
  const canSaveNow = hasUnsavedText && !isTextReadOnly;
  const handleSaveNow = () => {
    if (canSaveNow) void editor.save(editor.draftRef.current);
  };
  useSaveShortcut(handleSaveNow);

  const busyReason = !detail || isPagePending
    ? t('transcription.blockedPageLoading')
    : isPageReading
      ? t('transcription.blockedReading')
      : null;
  const verifyBlockedReason = busyReason ?? (!isVerified && !draft.trim() ? t('transcription.blockedEmptyPage') : null);

  const pageTitle =
    sources.viewerRef && pageTotal
      ? t('areas.library.viewerPageOf', { index: displayIndex + 1, total: pageTotal })
      : sources.viewerRef
        ? t('transcription.pageTitle', { n: displayIndex + 1 })
        : t('transcription.paneLabel');

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-surface-panel">
      <StudioPageHeader
        documentId={documentId}
        documentTitle={detail?.title ?? null}
        bookInfo={sources.bookInfo}
        onBack={onBack}
      />

      <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={layout.persistInspectorLayout}>
        <Panel id="transcription-main" className="flex min-w-0 flex-col">
          <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={layout.persistViewerLayout}>
            <Panel
              id="transcription-viewer"
              defaultSize={layout.initialViewerSize}
              minSize={VIEWER_MIN}
              maxSize={VIEWER_MAX}
              panelRef={layout.setViewerPanel}
              className="relative flex min-w-0 flex-col border-r border-editorial-border bg-surface-panel"
            >
              <StudioViewerPane
                loading={sources.viewerLoading}
                viewerRef={sources.viewerRef}
                siblingVersion={sources.siblingVersion}
                activeSource={sources.activeSource}
                aligned={sync.aligned}
                manualUnlinked={sources.manualUnlinked}
                onSourceChange={sync.changeSource}
                onToggleUnlinked={() => sources.setManualUnlinked((current) => !current)}
                onPageChange={handleViewerPageChange}
                onPageStatusChange={editor.setPendingStatus}
                jumpRequest={sync.jumpRequest}
                onJumpHandled={sync.clearJumpRequest}
              />
            </Panel>

            <ResizeHandle dragging={layout.dragging} onDragStart={layout.startDragging} />

            <Panel id="transcription-text" minSize={TEXT_MIN} className="flex min-w-0 flex-1 flex-col bg-surface-panel">
              {/* Niente "spinner al posto di tutto": scambiare l'intera
                  sezione a ogni cambio pagina smontava e rimontava intestazione
                  e editor per una lettura locale che dura pochi millisecondi —
                  uno scatto visibile per niente. La struttura resta, un velo la
                  copre se e quando il caricamento si fa sentire davvero. */}
              <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <StudioTextHeader
                  title={pageTitle}
                  synced={sync.synced}
                  pageIndex={pageIndex}
                  pageTotal={pageTotal}
                  onTextPageChange={editor.goToTextPage}
                  verified={isVerified}
                  verifying={revisionActions.verifying}
                  verifyBlockedReason={verifyBlockedReason}
                  onToggleVerified={() => void (isVerified ? revisionActions.unverify() : revisionActions.verify())}
                  readingPageLabel={readingPage?.pageLabel ?? null}
                  saveState={saveState}
                  canSave={canSaveNow}
                  saveBlockedReason={hasUnsavedText ? busyReason : null}
                  onSave={handleSaveNow}
                  textMenuOpen={textMenuOpen}
                  onTextMenuToggle={() => setTextMenuOpen((open) => !open)}
                />
                <div className="flex min-h-0 flex-1 flex-col bg-editorial-bg px-12 py-8">
                  <div className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-rule bg-editorial-page px-7 py-4 shadow-page-card">
                    <MarkdownEditor
                      identityKey={segment?.id ?? `${documentId}:${pageIndex}`}
                      flatToolbar
                      menuOpen={textMenuOpen}
                      onMenuOpenChange={setTextMenuOpen}
                      value={draft}
                      onChange={editor.changeDraft}
                      markdownEnabled
                      readOnly={isTextReadOnly}
                      fillHeight
                      textClassName="doc-content text-editorial-ink"
                      previewClassName="min-h-[280px] doc-content text-editorial-ink"
                      placeholder={t('transcription.textPlaceholder')}
                    />
                    <PagePendingOverlay
                      pending={isPagePending || isPageReading}
                      label={isPageReading && !isPagePending ? t('transcription.assist.readingInProgress') : undefined}
                      errorMessage={pagePendingError}
                    />
                  </div>
                </div>
              </section>
            </Panel>
          </Group>
        </Panel>

        <ResizeHandle dragging={layout.dragging} onDragStart={layout.startDragging} />

        <Panel
          id="transcription-inspector"
          collapsible
          collapsedSize={INSPECTOR_WIDTH.collapsed}
          minSize={INSPECTOR_WIDTH.min}
          maxSize={INSPECTOR_WIDTH.max}
          defaultSize={layout.initialInspectorWidth}
          panelRef={layout.setInspectorPanel}
          onResize={layout.syncInspectorCollapsed}
          className={`flex min-w-0 flex-col border-l border-editorial-border bg-surface-panel ${
            layout.dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
          }`}
        >
          <TranscriptionInspector
            activeTab={activeTab}
            onTabChange={setActiveTab}
            collapsed={layout.inspectorCollapsed}
            onCollapsedChange={layout.toggleInspectorCollapsed}
            revisions={editor.revisions}
            segment={segment}
            draft={draft}
            formatDate={(value) => formatRevisionDate(value, i18n.language)}
            onRestore={(revisionId) => void revisionActions.restore(revisionId)}
            onDeleteRevision={(revisionId) => void revisionActions.deleteRevision(revisionId)}
            onNameRevision={(revisionId, name) => void revisionActions.nameRevision(revisionId, name)}
            onClearHistory={() => void revisionActions.clearHistory()}
            pagePending={isPagePending}
            pagePendingError={pagePendingError}
            displayIndex={displayIndex}
            pageLabel={editor.pageLabel}
            pageTotal={pageTotal}
            verified={isVerified}
            document={detail}
            workspace={activeWorkspace}
            viewerRef={sources.viewerRef}
            ocrStarting={ocr.starting}
            ocrReading={isPageReading}
            pageTitleShort={String(displayIndex + 1)}
            onStartOcr={() => void ocr.start()}
            onDocumentOcrProviderChange={ocr.changeProvider}
            onDocumentOcrModelChange={ocr.changeModel}
            onDocumentOcrPromptChange={ocr.changePrompt}
            ocrImage={ocr.image}
            onOcrImageModeChange={ocr.changeImageMode}
          />
        </Panel>
      </Group>
    </div>
  );
}
