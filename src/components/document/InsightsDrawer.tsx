import {
  BarChart2,
  BookText,
  Brain,
  Link2,
  List,
  NotebookText,
  Search,
  ShieldCheck,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useUiStore, type InsightsDrawerTab, type ChunkDrawerTab } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { MemoryTab } from './MemoryTab';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunkWatchdog } from '../../hooks/useChunkWatchdog';
import { OperationsTab } from './OperationsTab';
import { SearchTab } from './SearchTab';
import { IconButton } from '../ui';
import { TabButton } from './tabs/TabButton';
import { IndexTab } from './tabs/IndexTab';
import { StatsTab } from './tabs/StatsTab';
import { ChunkSummaryTab } from './tabs/ChunkSummaryTab';
import { CoherenceTab } from './tabs/CoherenceTab';
import { AuditTab } from './tabs/AuditTab';
import { NotesTab } from './tabs/NotesTab';
import { GlossaryTab } from './tabs/GlossaryTab';

const DOC_TAB_ORDER: InsightsDrawerTab[] = ['index', 'search', 'stats', 'coherence', 'glossary'];
const CHUNK_TAB_ORDER: ChunkDrawerTab[] = ['audit', 'notes', 'operations', 'memory', 'summary'];

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

const CHUNK_TAB_BUTTON_IDS: Record<ChunkDrawerTab, string> = {
  summary: 'chunk-tab-button-summary',
  audit: 'chunk-tab-button-audit',
  notes: 'chunk-tab-button-notes',
  operations: 'chunk-tab-button-operations',
  memory: 'chunk-tab-button-memory',
};

const CHUNK_TAB_PANEL_IDS: Record<ChunkDrawerTab, string> = {
  summary: 'chunk-tab-panel-summary',
  audit: 'chunk-tab-panel-audit',
  notes: 'chunk-tab-panel-notes',
  operations: 'chunk-tab-panel-operations',
  memory: 'chunk-tab-panel-memory',
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

interface FlyoutHeaderProps {
  title: string;
  onClose: () => void;
}

function FlyoutHeader({ title, onClose }: FlyoutHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-editorial-border px-5 py-4">
      <div className="text-xs font-sans uppercase tracking-[0.12em] text-editorial-muted">{title}</div>
      <IconButton
        size="md"
        onClick={onClose}
        title={t('header.closeDrawer')}
        tooltipSide="left"
        className="shrink-0"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}

// ── Chunk inspector ────────────────────────────────────────────────────

interface ChunkInspectorPanelProps {
  onReauditChunk: (chunkId: string) => void;
  onClose: () => void;
}

export function ChunkInspectorPanel({ onReauditChunk, onClose }: ChunkInspectorPanelProps) {
  const { t } = useTranslation();
  const chunkDrawerTab = useUiStore((state) => state.chunkDrawerTab);
  const setChunkDrawerTab = useUiStore((state) => state.setChunkDrawerTab);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const clearFocusedIssue = useUiStore((state) => state.clearFocusedIssue);
  const { chunks, isProcessing, currentChunk, currentChunkIndex } = useInsightData();

  const tabButtonRefs = useRef<Partial<Record<ChunkDrawerTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    clearFocusedIssue();
  }, [chunkDrawerTab, currentChunk?.id, clearFocusedIssue]);

  const CHUNK_TAB_ICON: Record<ChunkDrawerTab, React.ReactNode> = {
    summary: <BarChart2 size={16} />,
    audit: <ShieldCheck size={16} />,
    notes: <NotebookText size={16} />,
    operations: <TerminalSquare size={16} />,
    memory: <Brain size={16} />,
  };
  const CHUNK_TAB_LABEL: Record<ChunkDrawerTab, string> = {
    summary: t('document.insightsTabSummary'),
    audit: t('document.insightsTabAudit'),
    notes: t('document.insightsTabNotes'),
    operations: t('document.insightsTabOperations'),
    memory: t('document.insightsTabMemory'),
  };

  const activateTab = (tab: ChunkDrawerTab) => {
    setChunkDrawerTab(tab);
    tabButtonRefs.current[tab]?.focus();
  };
  const handleTabKeyDown = (tab: ChunkDrawerTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = CHUNK_TAB_ORDER.indexOf(tab);
    let next: ChunkDrawerTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = CHUNK_TAB_ORDER[(idx - 1 + CHUNK_TAB_ORDER.length) % CHUNK_TAB_ORDER.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = CHUNK_TAB_ORDER[(idx + 1) % CHUNK_TAB_ORDER.length];
    else if (event.key === 'Home') next = CHUNK_TAB_ORDER[0];
    else if (event.key === 'End') next = CHUNK_TAB_ORDER[CHUNK_TAB_ORDER.length - 1];
    if (next) { event.preventDefault(); activateTab(next); }
  };

  const chunkLabel = currentChunk && currentChunkIndex >= 0
    ? `${t('document.chunkPanelTitle')} ${currentChunkIndex + 1}/${chunks.length}`
    : t('document.chunkPanelTitle');

  return (
    <div className="flex h-full flex-col" role="region" aria-label={chunkLabel}>
      <FlyoutHeader title={chunkLabel} onClose={onClose} />

      <div className="flex items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2">
        <div role="tablist" aria-orientation="horizontal" aria-label={chunkLabel} className="flex gap-1">
          {CHUNK_TAB_ORDER.map((tab) => (
            <TabButton
              key={tab}
              buttonId={CHUNK_TAB_BUTTON_IDS[tab]}
              active={chunkDrawerTab === tab}
              onClick={() => activateTab(tab)}
              onKeyDown={(e) => handleTabKeyDown(tab, e)}
              label={CHUNK_TAB_LABEL[tab]}
              icon={CHUNK_TAB_ICON[tab]}
              controls={CHUNK_TAB_PANEL_IDS[tab]}
              buttonRef={(el) => { tabButtonRefs.current[tab] = el; }}
            />
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
        <span className="font-display text-sm italic text-editorial-ink">{CHUNK_TAB_LABEL[chunkDrawerTab]}</span>
      </div>

      <div className={`flex flex-1 flex-col overflow-y-auto custom-scrollbar ${chunkDrawerTab === 'operations' ? 'bg-black' : 'bg-editorial-bg/40'}`}>
        {chunkDrawerTab === 'audit' ? (
          <AuditTab
            panelId={CHUNK_TAB_PANEL_IDS.audit}
            labelledBy={CHUNK_TAB_BUTTON_IDS.audit}
            currentChunk={currentChunk}
            isProcessing={isProcessing}
            onReauditChunk={onReauditChunk}
            onSelectChunk={setSelectedChunkId}
            onFocusIssue={focusIssueInChunk}
          />
        ) : chunkDrawerTab === 'notes' ? (
          <NotesTab
            panelId={CHUNK_TAB_PANEL_IDS.notes}
            labelledBy={CHUNK_TAB_BUTTON_IDS.notes}
            currentChunk={currentChunk}
          />
        ) : chunkDrawerTab === 'memory' ? (
          <MemoryTab
            panelId={CHUNK_TAB_PANEL_IDS.memory}
            labelledBy={CHUNK_TAB_BUTTON_IDS.memory}
            currentChunkId={currentChunk?.id ?? null}
          />
        ) : chunkDrawerTab === 'summary' ? (
          <ChunkSummaryTab
            panelId={CHUNK_TAB_PANEL_IDS.summary}
            labelledBy={CHUNK_TAB_BUTTON_IDS.summary}
            currentChunk={currentChunk}
          />
        ) : (
          <OperationsTab
            panelId={CHUNK_TAB_PANEL_IDS.operations}
            labelledBy={CHUNK_TAB_BUTTON_IDS.operations}
            currentChunkId={currentChunk?.id ?? null}
            chunks={chunks}
            onSelectChunk={setSelectedChunkId}
          />
        )}
      </div>
    </div>
  );
}

// ── Insight / documento ────────────────────────────────────────────────

interface InsightDocPanelProps {
  onRunCoherenceAudit: () => void;
  onClose: () => void;
}

export function InsightDocPanel({ onRunCoherenceAudit, onClose }: InsightDocPanelProps) {
  const { t } = useTranslation();
  const documentDrawerTab = useUiStore((state) => state.documentDrawerTab);
  const setDocumentDrawerTab = useUiStore((state) => state.setDocumentDrawerTab);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const { chunks, isProcessing, currentChunk } = useInsightData();
  const allChunksTranslated = chunks.length > 0 && chunks.every((c) => c.currentDraft?.trim());
  const allChunksLocked = chunks.length > 0 && chunks.every((c) => c.translationLocked);
  const unlockedChunksCount = chunks.filter((c) => c.currentDraft?.trim() && !c.translationLocked).length;

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
    <div className="flex h-full flex-col" role="region" aria-label={t('document.insightsDrawerTitle')}>
      <FlyoutHeader title={t('document.insightsDrawerTitle')} onClose={onClose} />

      <div className="flex items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2">
        <div role="tablist" aria-orientation="horizontal" aria-label={t('document.insightsDrawerTitle')} className="flex gap-1">
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
