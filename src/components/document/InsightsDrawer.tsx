import {
  BarChart2,
  BookText,
  Brain,
  Eye,
  Layers,
  Link2,
  List,
  NotebookText,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useUiStore, type InsightsDrawerTab, type ChunkRailTab } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { MemoryTab } from './tabs/MemoryTab';
import { ReferencesTab } from './tabs/ReferencesTab';
import { ChunkPromptPreviewTab } from './tabs/ChunkPromptPreviewTab';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunkWatchdog } from '../../hooks/useChunkWatchdog';
import { SearchTab } from './SearchTab';
import { TabButton } from './tabs/TabButton';
import { IndexTab } from './tabs/IndexTab';
import { StatsTab } from './tabs/StatsTab';
import { CoherenceTab } from './tabs/CoherenceTab';
import { AuditTab } from './tabs/AuditTab';
import { NotesTab } from './tabs/NotesTab';
import { GlossaryTab } from './tabs/GlossaryTab';

const DOC_TAB_ORDER: InsightsDrawerTab[] = ['index', 'search', 'stats', 'coherence', 'glossary'];
// Ordine visivo: prima quello che serve preparando la traduzione (Riferimenti,
// Anteprima), poi quello che ha senso solo su un frammento già tradotto
// (Audit, Memoria); Note è slegata dal ciclo e sta a parte, in coda.
const CHUNK_RAIL_TAB_ORDER: ChunkRailTab[] = ['references', 'promptPreview', 'audit', 'memory', 'notes'];
const CHUNK_RAIL_TABS_BEFORE_TRANSLATION: ChunkRailTab[] = ['references', 'promptPreview'];
const CHUNK_RAIL_TABS_AFTER_TRANSLATION: ChunkRailTab[] = ['audit', 'memory'];

const DOC_TAB_BUTTON_IDS: Record<InsightsDrawerTab, string> = {
  index: 'insights-tab-button-index',
  search: 'insights-tab-button-search',
  stats: 'insights-tab-button-stats',
  coherence: 'insights-tab-button-coherence',
  glossary: 'insights-tab-button-glossary',
};

const DOC_TAB_PANEL_IDS: Record<InsightsDrawerTab, string> = {
  index: 'insights-tab-panel-index',
  search: 'insights-tab-panel-search',
  stats: 'insights-tab-panel-stats',
  coherence: 'insights-tab-panel-coherence',
  glossary: 'insights-tab-panel-glossary',
};

const CHUNK_RAIL_TAB_BUTTON_IDS: Record<ChunkRailTab, string> = {
  audit: 'chunk-rail-tab-button-audit',
  notes: 'chunk-rail-tab-button-notes',
  memory: 'chunk-rail-tab-button-memory',
  references: 'chunk-rail-tab-button-references',
  promptPreview: 'chunk-rail-tab-button-prompt-preview',
};

const CHUNK_RAIL_TAB_PANEL_IDS: Record<ChunkRailTab, string> = {
  audit: 'chunk-rail-tab-panel-audit',
  notes: 'chunk-rail-tab-panel-notes',
  memory: 'chunk-rail-tab-panel-memory',
  references: 'chunk-rail-tab-panel-references',
  promptPreview: 'chunk-rail-tab-panel-prompt-preview',
};

/** Stato condiviso letto da entrambi i pannelli del fly-out. */
function useInsightData() {
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const currentChunk = chunks.find((c) => c.id === selectedChunkId) ?? chunks[0] ?? null;
  const currentChunkIndex = currentChunk ? chunks.findIndex((c) => c.id === currentChunk.id) : -1;
  return { chunks, isProcessing, currentChunk, currentChunkIndex };
}

// ── Chunk inspector (rail sinistra — embedded, senza close) ───────────

interface ChunkInspectorPanelProps {
  onReauditChunk: (chunkId: string) => void;
}

export function ChunkInspectorPanel({ onReauditChunk }: ChunkInspectorPanelProps) {
  const { t } = useTranslation();
  const chunkRailTab = useUiStore((state) => state.chunkRailTab);
  const setChunkRailTab = useUiStore((state) => state.setChunkRailTab);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const clearFocusedIssue = useUiStore((state) => state.clearFocusedIssue);
  const { chunks, isProcessing, currentChunk, currentChunkIndex } = useInsightData();

  const tabButtonRefs = useRef<Partial<Record<ChunkRailTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    clearFocusedIssue();
  }, [chunkRailTab, currentChunk?.id, clearFocusedIssue]);

  const CHUNK_RAIL_TAB_ICON: Record<ChunkRailTab, React.ReactNode> = {
    audit: <ShieldCheck size={16} />,
    notes: <NotebookText size={16} />,
    memory: <Brain size={16} />,
    references: <Layers size={16} />,
    promptPreview: <Eye size={16} />,
  };
  const CHUNK_RAIL_TAB_LABEL: Record<ChunkRailTab, string> = {
    audit: t('document.insightsTabAudit'),
    notes: t('document.insightsTabNotes'),
    memory: t('document.insightsTabMemory'),
    references: t('document.insightsTabReferences'),
    promptPreview: t('document.insightsTabPromptPreview'),
  };

  const activateTab = (tab: ChunkRailTab) => {
    setChunkRailTab(tab);
    tabButtonRefs.current[tab]?.focus();
  };
  const handleTabKeyDown = (tab: ChunkRailTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = CHUNK_RAIL_TAB_ORDER.indexOf(tab);
    let next: ChunkRailTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = CHUNK_RAIL_TAB_ORDER[(idx - 1 + CHUNK_RAIL_TAB_ORDER.length) % CHUNK_RAIL_TAB_ORDER.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = CHUNK_RAIL_TAB_ORDER[(idx + 1) % CHUNK_RAIL_TAB_ORDER.length];
    else if (event.key === 'Home') next = CHUNK_RAIL_TAB_ORDER[0];
    else if (event.key === 'End') next = CHUNK_RAIL_TAB_ORDER[CHUNK_RAIL_TAB_ORDER.length - 1];
    if (next) { event.preventDefault(); activateTab(next); }
  };

  const chunkLabel = currentChunk && currentChunkIndex >= 0
    ? `${t('document.chunkPanelTitle')} ${currentChunkIndex + 1}/${chunks.length}`
    : t('document.chunkPanelTitle');

  // Audit e Memoria hanno senso solo su un frammento già tradotto: restano
  // visibili ma attenuati/disattivati prima, con un motivo nel tooltip.
  const isChunkTranslated = !!currentChunk?.translationLocked;
  const tabDisabledReason: Partial<Record<ChunkRailTab, string>> = {
    audit: !isChunkTranslated ? t('document.chunkTabLockedForAudit') : undefined,
    memory: !isChunkTranslated ? t('document.chunkTabLockedForMemory') : undefined,
  };

  const renderTab = (tab: ChunkRailTab) => (
    <TabButton
      key={tab}
      buttonId={CHUNK_RAIL_TAB_BUTTON_IDS[tab]}
      active={chunkRailTab === tab}
      activeTone="success"
      disabled={!!tabDisabledReason[tab]}
      onClick={() => activateTab(tab)}
      onKeyDown={(e) => handleTabKeyDown(tab, e)}
      label={
        tabDisabledReason[tab]
          ? `${CHUNK_RAIL_TAB_LABEL[tab]} — ${tabDisabledReason[tab]}`
          : CHUNK_RAIL_TAB_LABEL[tab]
      }
      icon={CHUNK_RAIL_TAB_ICON[tab]}
      controls={CHUNK_RAIL_TAB_PANEL_IDS[tab]}
      buttonRef={(el) => { tabButtonRefs.current[tab] = el; }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={chunkLabel}>
      <div className="flex shrink-0 items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-3 py-2">
        <div role="tablist" aria-orientation="horizontal" aria-label={chunkLabel} className="flex flex-1 items-center gap-1">
          {CHUNK_RAIL_TABS_BEFORE_TRANSLATION.map(renderTab)}
          <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
          {CHUNK_RAIL_TABS_AFTER_TRANSLATION.map(renderTab)}
          <div className="ml-auto">{renderTab('notes')}</div>
        </div>
        <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
        <span className="font-display text-sm italic text-editorial-ink">{CHUNK_RAIL_TAB_LABEL[chunkRailTab]}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-editorial-bg/40 pb-6 custom-scrollbar">
        {chunkRailTab === 'audit' ? (
          <AuditTab
            panelId={CHUNK_RAIL_TAB_PANEL_IDS.audit}
            labelledBy={CHUNK_RAIL_TAB_BUTTON_IDS.audit}
            currentChunk={currentChunk}
            isProcessing={isProcessing}
            onReauditChunk={onReauditChunk}
            onSelectChunk={setSelectedChunkId}
            onFocusIssue={focusIssueInChunk}
          />
        ) : chunkRailTab === 'notes' ? (
          <NotesTab
            panelId={CHUNK_RAIL_TAB_PANEL_IDS.notes}
            labelledBy={CHUNK_RAIL_TAB_BUTTON_IDS.notes}
            currentChunk={currentChunk}
          />
        ) : chunkRailTab === 'memory' ? (
          <MemoryTab
            panelId={CHUNK_RAIL_TAB_PANEL_IDS.memory}
            labelledBy={CHUNK_RAIL_TAB_BUTTON_IDS.memory}
            currentChunk={currentChunk}
          />
        ) : chunkRailTab === 'references' ? (
          <ReferencesTab
            panelId={CHUNK_RAIL_TAB_PANEL_IDS.references}
            labelledBy={CHUNK_RAIL_TAB_BUTTON_IDS.references}
            currentChunk={currentChunk}
          />
        ) : (
          <ChunkPromptPreviewTab
            panelId={CHUNK_RAIL_TAB_PANEL_IDS.promptPreview}
            labelledBy={CHUNK_RAIL_TAB_BUTTON_IDS.promptPreview}
            currentChunk={currentChunk}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab documento del pannello Insight (rail destra) ────────────────────
// Da non confondere con ChunkInspectorPanel sopra: quello vive nella rail
// sinistra ed è scope-frammento (Audit/Note/Memoria); questo è scope-documento
// (Indice/Cerca/Statistiche/Coerenza/Glossario) e vive in ProjectInspectorNext.

interface DocumentInsightTabsProps {
  onRunCoherenceAudit: () => void;
}

export function DocumentInsightTabs({ onRunCoherenceAudit }: DocumentInsightTabsProps) {
  const { t } = useTranslation();
  const documentDrawerTab = useUiStore((state) => state.documentDrawerTab);
  const setDocumentDrawerTab = useUiStore((state) => state.setDocumentDrawerTab);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const { chunks, isProcessing, currentChunk } = useInsightData();
  const allChunksTranslated = chunks.length > 0 && chunks.every((c) => c.translationDisplayText.trim());
  const allChunksLocked = chunks.length > 0 && chunks.every((c) => c.translationLocked);
  const unlockedChunksCount = chunks.filter((c) => c.translationDisplayText.trim() && !c.translationLocked).length;

  const { stuckChunkIds, cancelStuckChunk } = useChunkWatchdog();
  const { config } = usePipelineStore();
  const hasGlossary = !!config.assignedGlossaryId && config.glossary.length > 0;

  const tabButtonRefs = useRef<Partial<Record<InsightsDrawerTab, HTMLButtonElement | null>>>({});

  // Esci dal tab glossario se il glossario viene rimosso.
  useEffect(() => {
    if (!hasGlossary && documentDrawerTab === 'glossary') {
      setDocumentDrawerTab('index');
    }
  }, [hasGlossary, documentDrawerTab, setDocumentDrawerTab]);

  const DOC_TAB_ICON: Record<InsightsDrawerTab, React.ReactNode> = {
    index: <List size={16} />,
    search: <Search size={16} />,
    stats: <BarChart2 size={16} />,
    coherence: <Link2 size={16} />,
    glossary: <BookText size={16} />,
  };
  const DOC_TAB_LABEL: Record<InsightsDrawerTab, string> = {
    index: t('document.insightsTabIndex'),
    search: t('document.insightsTabSearch'),
    stats: t('document.insightsTabStats'),
    coherence: t('document.insightsTabCoherence'),
    glossary: t('document.insightsTabGlossary'),
  };

  const enabledTabOrder = DOC_TAB_ORDER.filter((tab) => tab !== 'glossary' || hasGlossary);

  const activateTab = (tab: InsightsDrawerTab) => {
    setDocumentDrawerTab(tab);
    tabButtonRefs.current[tab]?.focus();
  };
  const handleTabKeyDown = (tab: InsightsDrawerTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = enabledTabOrder.indexOf(tab);
    let next: InsightsDrawerTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = enabledTabOrder[(idx - 1 + enabledTabOrder.length) % enabledTabOrder.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = enabledTabOrder[(idx + 1) % enabledTabOrder.length];
    else if (event.key === 'Home') next = enabledTabOrder[0];
    else if (event.key === 'End') next = enabledTabOrder[enabledTabOrder.length - 1];
    if (next) { event.preventDefault(); activateTab(next); }
  };

  return (
    <div className="flex h-full flex-col" role="region" aria-label={t('document.insightTabsLabel')}>
      <div className="flex items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2">
        <div role="tablist" aria-orientation="horizontal" aria-label={t('document.insightTabsLabel')} className="flex gap-1">
          {DOC_TAB_ORDER.map((tab) => (
            <TabButton
              key={tab}
              buttonId={DOC_TAB_BUTTON_IDS[tab]}
              active={documentDrawerTab === tab}
              disabled={tab === 'glossary' && !hasGlossary}
              onClick={() => activateTab(tab)}
              onKeyDown={(e) => handleTabKeyDown(tab, e)}
              label={tab === 'glossary' && !hasGlossary ? t('document.insightsGlossaryEmpty') : DOC_TAB_LABEL[tab]}
              icon={DOC_TAB_ICON[tab]}
              controls={DOC_TAB_PANEL_IDS[tab]}
              buttonRef={(el) => { tabButtonRefs.current[tab] = el; }}
            />
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
        <span className="font-display text-sm italic text-editorial-ink">{DOC_TAB_LABEL[documentDrawerTab]}</span>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto bg-editorial-bg/40 custom-scrollbar">
        {documentDrawerTab === 'index' ? (
          <IndexTab
            panelId={DOC_TAB_PANEL_IDS.index}
            labelledBy={DOC_TAB_BUTTON_IDS.index}
            chunks={chunks}
            currentChunkId={currentChunk?.id ?? null}
            stuckChunkIds={stuckChunkIds}
            onSelect={(id) => setSelectedChunkId(id)}
            onCancelStuck={cancelStuckChunk}
          />
        ) : documentDrawerTab === 'search' ? (
          <SearchTab
            panelId={DOC_TAB_PANEL_IDS.search}
            labelledBy={DOC_TAB_BUTTON_IDS.search}
            chunks={chunks}
            currentChunkId={currentChunk?.id ?? null}
            onSelectChunk={setSelectedChunkId}
          />
        ) : documentDrawerTab === 'stats' ? (
          <StatsTab
            panelId={DOC_TAB_PANEL_IDS.stats}
            labelledBy={DOC_TAB_BUTTON_IDS.stats}
            chunks={chunks}
          />
        ) : documentDrawerTab === 'glossary' ? (
          <GlossaryTab
            panelId={DOC_TAB_PANEL_IDS.glossary}
            labelledBy={DOC_TAB_BUTTON_IDS.glossary}
            glossary={config.glossary}
          />
        ) : (
          <CoherenceTab
            panelId={DOC_TAB_PANEL_IDS.coherence}
            labelledBy={DOC_TAB_BUTTON_IDS.coherence}
            currentChunk={currentChunk}
            isProcessing={isProcessing}
            allChunksTranslated={allChunksTranslated}
            allChunksLocked={allChunksLocked}
            unlockedChunksCount={unlockedChunksCount}
            onSelectChunk={setSelectedChunkId}
            onFocusIssue={focusIssueInChunk}
            onRunCoherenceAudit={onRunCoherenceAudit}
          />
        )}
      </div>
    </div>
  );
}
