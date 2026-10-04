import { useEffect, type ReactNode } from 'react';
import { BookText, Brain, Eye, FileStack, ShieldCheck, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore, type TranslationStudioTab } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { InspectorShell, type InspectorTab } from '../ui';
import { ChunkCostPanel, PipelineSidebarRunSection } from '../layout/PipelineSidebarSections';
import { ChunkPromptPreviewTab } from '../document/tabs/ChunkPromptPreviewTab';
import { GlossaryTab } from '../document/tabs/GlossaryTab';
import { DocumentGroupTab, type DocumentView } from './DocumentGroupTab';
import { MemoryGroupTab, type MemoryView } from './MemoryGroupTab';
import { openAuditIssueCount, ReviewTab, type ReviewView } from './ReviewTab';

/**
 * Le linguette della colonna. Memoria, Revisione e Documento raccolgono più
 * viste come sottolinguette; ognuna di quelle viste è un valore di
 * `studioTab`, così chi apre le note da un altro punto le trova al loro posto.
 * La ricerca nel documento sta nella fila sopra i fogli.
 */
type ColumnTab = 'glossary' | 'phraseMemory' | 'promptPreview' | 'review' | 'document';

/**
 * Ordine: il Glossario per primo, da solo, perché si consulta di continuo
 * durante il controllo; poi il lavoro sul frammento nell'ordine in cui si fa
 * (memoria, richiesta al modello, revisione); in coda il documento intero.
 */
const TAB_ORDER: ColumnTab[] = ['glossary', 'phraseMemory', 'promptPreview', 'review', 'document'];

const TAB_ICON: Record<ColumnTab, ReactNode> = {
  glossary: <BookText size={16} />,
  phraseMemory: <Brain size={16} />,
  promptPreview: <Eye size={16} />,
  review: <ShieldCheck size={16} />,
  document: <FileStack size={16} />,
};

const TAB_LABEL_KEY: Record<ColumnTab, string> = {
  glossary: 'document.insightsTabGlossary',
  phraseMemory: 'document.insightsTabMemory',
  promptPreview: 'document.insightsTabPromptPreview',
  review: 'document.insightsTabReview',
  document: 'document.insightsTabDocument',
};

function isMemoryView(tab: TranslationStudioTab): tab is MemoryView {
  return tab === 'references' || tab === 'memory';
}

function isReviewView(tab: TranslationStudioTab): tab is ReviewView {
  return tab === 'audit' || tab === 'notes' || tab === 'sourceNotes' || tab === 'history';
}

function isDocumentView(tab: TranslationStudioTab): tab is DocumentView {
  return tab === 'index' || tab === 'stats' || tab === 'coherence';
}

/** La linguetta della colonna che mostra una vista. */
function columnTabOf(tab: TranslationStudioTab): ColumnTab {
  if (isMemoryView(tab) || tab === 'search') return 'phraseMemory';
  if (isReviewView(tab)) return 'review';
  if (isDocumentView(tab)) return 'document';
  return tab;
}

const panelId = (tab: ColumnTab) => `inspector-tab-panel-${tab}`;
const buttonId = (tab: ColumnTab) => `inspector-tab-button-${tab}`;

interface TranslationInspectorProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onRunPipeline: () => void;
  onCancelPipeline: () => void;
  onRetranslateChunk: (chunkId: string) => void;
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

/**
 * La colonna destra dello Studio di traduzione: in cima l'esecuzione, sempre in
 * vista; sotto le linguette del frammento e del documento.
 */
export function TranslationInspector({
  collapsed,
  onCollapsedChange,
  onRunPipeline,
  onCancelPipeline,
  onRetranslateChunk,
  onReauditChunk,
  onRunCoherenceAudit,
}: TranslationInspectorProps) {
  const { t } = useTranslation();
  const activeTab = useUiStore((s) => s.studioTab);
  const setStudioTab = useUiStore((s) => s.setStudioTab);
  const groupViews = useUiStore((s) => s.studioGroupViews);
  const selectedChunkId = useUiStore((s) => s.selectedChunkId);
  const setSelectedChunkId = useUiStore((s) => s.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((s) => s.focusIssueInChunk);
  const clearFocusedIssue = useUiStore((s) => s.clearFocusedIssue);
  const chunks = useChunksStore((s) => s.chunks);
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const glossary = usePipelineStore((s) => s.config.glossary);
  const hasGlossary = usePipelineStore((s) => !!s.config.assignedGlossaryId && s.config.glossary.length > 0);

  const currentChunk = chunks.find((c) => c.id === selectedChunkId) ?? chunks[0] ?? null;

  // Il Glossario ha senso solo con un glossario assegnato: resta visibile,
  // spento, con il motivo. Le altre linguette sono sempre aperte; dentro si
  // spengono le viste che aspettano la traduzione (estrazione, audit).
  const disabledReason: Partial<Record<ColumnTab, string>> = {
    glossary: hasGlossary ? undefined : t('document.insightsGlossaryEmpty'),
  };
  const columnTab = columnTabOf(activeTab);
  // Una linguetta che si spegne mentre è aperta lascia il posto alla prima accesa.
  const firstEnabledTab = TAB_ORDER.find((tab) => !disabledReason[tab]) ?? 'phraseMemory';
  const shownTab: ColumnTab = disabledReason[columnTab] ? firstEnabledTab : columnTab;
  // Ogni gruppo riapre la vista lasciata aperta; la prima volta la sua iniziale.
  const memoryView: MemoryView = isMemoryView(activeTab) ? activeTab : groupViews.memory;
  const reviewView: ReviewView = isReviewView(activeTab) ? activeTab : groupViews.review ?? 'audit';
  const documentView: DocumentView = isDocumentView(activeTab) ? activeTab : groupViews.document;

  useEffect(() => {
    clearFocusedIssue();
  }, [shownTab, currentChunk?.id, clearFocusedIssue]);

  const openTab = (tab: ColumnTab) => {
    if (tab === 'phraseMemory') setStudioTab(memoryView);
    // Revisione parte dall'audit se ha segnalazioni aperte, sennò dalle note.
    else if (tab === 'review') setStudioTab(groupViews.review ?? (openAuditIssueCount(currentChunk) > 0 ? 'audit' : 'notes'));
    else if (tab === 'document') setStudioTab(documentView);
    else setStudioTab(tab);
  };

  const tabs: InspectorTab[] = TAB_ORDER.map((tab) => ({
    id: tab,
    label: disabledReason[tab] ? `${t(TAB_LABEL_KEY[tab])} — ${disabledReason[tab]}` : t(TAB_LABEL_KEY[tab]),
    icon: TAB_ICON[tab],
    disabled: Boolean(disabledReason[tab]),
  }));

  const tabProps = (tab: ColumnTab) => ({ panelId: panelId(tab), labelledBy: buttonId(tab) });

  const renderTab = (): ReactNode => {
    switch (shownTab) {
      case 'glossary':
        return <GlossaryTab {...tabProps('glossary')} glossary={glossary} />;
      case 'phraseMemory':
        return (
          <MemoryGroupTab {...tabProps('phraseMemory')} view={memoryView} onViewChange={setStudioTab} currentChunk={currentChunk} />
        );
      case 'promptPreview':
        return <ChunkPromptPreviewTab {...tabProps('promptPreview')} currentChunk={currentChunk} />;
      case 'review':
        return (
          <ReviewTab
            {...tabProps('review')}
            view={reviewView}
            onViewChange={setStudioTab}
            currentChunk={currentChunk}
            isProcessing={isProcessing}
            onReauditChunk={onReauditChunk}
            onSelectChunk={setSelectedChunkId}
            onFocusIssue={focusIssueInChunk}
          />
        );
      case 'document':
        return (
          <DocumentGroupTab
            {...tabProps('document')}
            view={documentView}
            onViewChange={setStudioTab}
            chunks={chunks}
            currentChunk={currentChunk}
            isProcessing={isProcessing}
            onSelectChunk={setSelectedChunkId}
            onFocusIssue={focusIssueInChunk}
            onRunCoherenceAudit={onRunCoherenceAudit}
          />
        );
    }
  };

  const runSection = (isCollapsed: boolean) => (
    <PipelineSidebarRunSection
      collapsed={isCollapsed}
      onRunPipeline={onRunPipeline}
      onCancelPipeline={onCancelPipeline}
      onRetranslateChunk={onRetranslateChunk}
    />
  );

  return (
    <InspectorShell
      ariaLabel={t('document.studioInspectorLabel')}
      headerHeightClassName="h-14"
      tabRowHeightClassName="h-12"
      tabs={tabs}
      activeTab={shownTab}
      onTabChange={(id) => openTab(id as ColumnTab)}
      actions={<span className="font-display text-sm italic text-editorial-ink">{t(TAB_LABEL_KEY[shownTab])}</span>}
      ownsPanelSemantics={false}
      // Solo l'Anteprima scorre nella colonna; le altre portano il loro elenco.
      bodyScrolls={shownTab === 'promptPreview'}
      panelIcon={<Wrench size={15} />}
      panelLabel={t('transcription.inspectorPanelTitle')}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      collapsedContent={runSection(true)}
      beforeTabs={
        <div className="flex flex-col gap-3 px-3 py-3">
          {runSection(false)}
          <ChunkCostPanel />
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">{renderTab()}</div>
    </InspectorShell>
  );
}
