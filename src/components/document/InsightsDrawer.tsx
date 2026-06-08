import {
  BarChart2,
  BookText,
  Brain,
  Link2,
  List,
  NotebookText,
  PanelRight,
  Search,
  ShieldCheck,
  TerminalSquare,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useUiStore, type InsightsDrawerTab, type ChunkDrawerTab } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { MemoryTab } from './MemoryTab';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunkWatchdog } from '../../hooks/useChunkWatchdog';
import { OperationsTab } from './OperationsTab';
import { SearchTab } from './SearchTab';
import { IconButton, Tooltip } from '../ui';
import { TabButton } from './tabs/TabButton';
import { IndexTab } from './tabs/IndexTab';
import { StatsTab } from './tabs/StatsTab';
import { ChunkSummaryTab } from './tabs/ChunkSummaryTab';
import { CoherenceTab } from './tabs/CoherenceTab';
import { AuditTab } from './tabs/AuditTab';
import { NotesTab } from './tabs/NotesTab';
import { GlossaryTab } from './tabs/GlossaryTab';

interface InsightsDrawerProps {
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

const PANEL_WIDTH = 430;

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

export function InsightsDrawer({ onReauditChunk, onRunCoherenceAudit }: InsightsDrawerProps) {
  const { t } = useTranslation();
  const showDocumentDrawer = useUiStore((state) => state.showDocumentDrawer);
  const documentDrawerTab = useUiStore((state) => state.documentDrawerTab);
  const showChunkDrawer = useUiStore((state) => state.showChunkDrawer);
  const chunkDrawerTab = useUiStore((state) => state.chunkDrawerTab);
  const setShowDocumentDrawer = useUiStore((state) => state.setShowDocumentDrawer);
  const setDocumentDrawerTab = useUiStore((state) => state.setDocumentDrawerTab);
  const setShowChunkDrawer = useUiStore((state) => state.setShowChunkDrawer);
  const setChunkDrawerTab = useUiStore((state) => state.setChunkDrawerTab);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const allChunksTranslated = chunks.length > 0 && chunks.every((c) => c.currentDraft?.trim());
  const allChunksLocked = chunks.length > 0 && chunks.every((c) => c.translationLocked);
  const unlockedChunksCount = chunks.filter((c) => c.currentDraft?.trim() && !c.translationLocked).length;
  const currentChunk = chunks.find((c) => c.id === selectedChunkId) ?? chunks[0] ?? null;
  const currentChunkIndex = currentChunk ? chunks.findIndex((c) => c.id === currentChunk.id) : -1;

  const { stuckChunkIds, cancelStuckChunk } = useChunkWatchdog();
  const { config } = usePipelineStore();
  const hasGlossary = !!config.assignedGlossaryId && config.glossary.length > 0;

  // Redirect away from the glossary tab if the glossary is removed.
  useEffect(() => {
    if (!hasGlossary && documentDrawerTab === 'glossary') {
      setDocumentDrawerTab('index');
    }
  }, [hasGlossary, documentDrawerTab, setDocumentDrawerTab]);

  const docTabButtonRefs = useRef<Partial<Record<InsightsDrawerTab, HTMLButtonElement | null>>>({});
  const chunkTabButtonRefs = useRef<Partial<Record<ChunkDrawerTab, HTMLButtonElement | null>>>({});

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

  const enabledDocTabOrder = DOC_TAB_ORDER.filter((tab) => tab !== 'glossary' || hasGlossary);

  const activateDocTab = (tab: InsightsDrawerTab) => {
    setDocumentDrawerTab(tab);
    docTabButtonRefs.current[tab]?.focus();
  };
  const activateChunkTab = (tab: ChunkDrawerTab) => {
    setChunkDrawerTab(tab);
    chunkTabButtonRefs.current[tab]?.focus();
  };

  const handleDocTabKeyDown = (tab: InsightsDrawerTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = enabledDocTabOrder.indexOf(tab);
    let next: InsightsDrawerTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = enabledDocTabOrder[(idx - 1 + enabledDocTabOrder.length) % enabledDocTabOrder.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = enabledDocTabOrder[(idx + 1) % enabledDocTabOrder.length];
    else if (event.key === 'Home') next = enabledDocTabOrder[0];
    else if (event.key === 'End') next = enabledDocTabOrder[enabledDocTabOrder.length - 1];
    if (next) { event.preventDefault(); activateDocTab(next); }
  };
  const handleChunkTabKeyDown = (tab: ChunkDrawerTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = CHUNK_TAB_ORDER.indexOf(tab);
    let next: ChunkDrawerTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = CHUNK_TAB_ORDER[(idx - 1 + CHUNK_TAB_ORDER.length) % CHUNK_TAB_ORDER.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = CHUNK_TAB_ORDER[(idx + 1) % CHUNK_TAB_ORDER.length];
    else if (event.key === 'Home') next = CHUNK_TAB_ORDER[0];
    else if (event.key === 'End') next = CHUNK_TAB_ORDER[CHUNK_TAB_ORDER.length - 1];
    if (next) { event.preventDefault(); activateChunkTab(next); }
  };

  const chunkLabel = currentChunk && currentChunkIndex >= 0
    ? `${t('document.chunkPanelTitle')} ${currentChunkIndex + 1}/${chunks.length}`
    : t('document.chunkPanelTitle');

  return (
    <div className="flex h-full shrink-0">

      {/* ── Chunk panel ─────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!showChunkDrawer && (
          <motion.button
            key="chunk-strip"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShowChunkDrawer(true)}
            className="flex w-8 shrink-0 flex-col items-center justify-center gap-3 self-stretch border-l border-editorial-border bg-editorial-bg/80 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editorial-accent"
            aria-label={t('document.openChunkPanel')}
          >
            <Tooltip label={t('document.openChunkPanel')} side="left" className="h-full w-full">
              <span className="flex h-full w-full flex-col items-center justify-center gap-3">
                <ShieldCheck size={14} />
                <span className="[writing-mode:vertical-lr] rotate-180 text-[9px] font-bold uppercase tracking-[0.3em]">
                  {t('document.chunkPanelTitle')}
                </span>
              </span>
            </Tooltip>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showChunkDrawer && (
          <motion.aside
            key="chunk-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`flex h-full overflow-hidden border-l bg-editorial-bg/95 ${chunkDrawerTab === 'operations' ? 'border-terminal-border' : 'border-editorial-border'}`}
            role="region"
            aria-label={chunkLabel}
          >
            <div className="flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
              <div className="flex items-center justify-between gap-3 border-b border-editorial-border px-5 py-4">
                <div className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {chunkLabel}
                </div>
                <IconButton
                  size="md"
                  onClick={() => setShowChunkDrawer(false)}
                  title={t('header.closeDrawer')}
                  tooltipSide="left"
                  className="shrink-0"
                >
                  <X size={16} />
                </IconButton>
              </div>

              <div className="flex items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2">
                <div role="tablist" aria-orientation="horizontal" aria-label={chunkLabel} className="flex gap-1">
                  {CHUNK_TAB_ORDER.map((tab) => (
                    <TabButton
                      key={tab}
                      buttonId={CHUNK_TAB_BUTTON_IDS[tab]}
                      active={chunkDrawerTab === tab}
                      onClick={() => activateChunkTab(tab)}
                      onKeyDown={(e) => handleChunkTabKeyDown(tab, e)}
                      label={CHUNK_TAB_LABEL[tab]}
                      icon={CHUNK_TAB_ICON[tab]}
                      controls={CHUNK_TAB_PANEL_IDS[tab]}
                      buttonRef={(el) => { chunkTabButtonRefs.current[tab] = el; }}
                    />
                  ))}
                </div>
                <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
                <span className="font-display italic text-sm text-editorial-ink">{CHUNK_TAB_LABEL[chunkDrawerTab]}</span>
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
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Document panel ──────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!showDocumentDrawer && (
          <motion.button
            key="doc-strip"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShowDocumentDrawer(true)}
            className="flex w-8 shrink-0 flex-col items-center justify-center gap-3 self-stretch border-l border-editorial-border bg-editorial-bg/80 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editorial-accent"
            aria-label={t('header.openInsights')}
          >
            <Tooltip label={t('header.openInsights')} side="left" className="h-full w-full">
              <span className="flex h-full w-full flex-col items-center justify-center gap-3">
                <PanelRight size={14} />
                <span className="[writing-mode:vertical-lr] rotate-180 text-[9px] font-bold uppercase tracking-[0.3em]">
                  {t('document.insightsDrawerTitle')}
                </span>
              </span>
            </Tooltip>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showDocumentDrawer && (
          <motion.aside
            key="doc-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="flex h-full overflow-hidden border-l border-editorial-border bg-editorial-bg/95"
            role="region"
            aria-label={t('document.insightsDrawerTitle')}
          >
            <div className="flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
              <div className="flex items-center justify-between gap-3 border-b border-editorial-border px-5 py-4">
                <div className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('document.insightsDrawerTitle')}
                </div>
                <IconButton
                  size="md"
                  onClick={() => setShowDocumentDrawer(false)}
                  title={t('header.closeDrawer')}
                  tooltipSide="left"
                  className="shrink-0"
                >
                  <X size={16} />
                </IconButton>
              </div>

              <div className="flex items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2">
                <div role="tablist" aria-orientation="horizontal" aria-label={t('document.insightsDrawerTitle')} className="flex gap-1">
                  {DOC_TAB_ORDER.map((tab) => (
                    <TabButton
                      key={tab}
                      buttonId={DOC_TAB_BUTTON_IDS[tab]}
                      active={documentDrawerTab === tab}
                      disabled={tab === 'glossary' && !hasGlossary}
                      onClick={() => activateDocTab(tab)}
                      onKeyDown={(e) => handleDocTabKeyDown(tab, e)}
                      label={tab === 'glossary' && !hasGlossary ? t('document.insightsGlossaryEmpty') : DOC_TAB_LABEL[tab]}
                      icon={DOC_TAB_ICON[tab]}
                      controls={DOC_TAB_PANEL_IDS[tab]}
                      buttonRef={(el) => { docTabButtonRefs.current[tab] = el; }}
                    />
                  ))}
                </div>
                <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
                <span className="font-display italic text-sm text-editorial-ink">{DOC_TAB_LABEL[documentDrawerTab]}</span>
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
          </motion.aside>
        )}
      </AnimatePresence>

    </div>
  );
}
