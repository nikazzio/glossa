import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock,
  Cpu,
  ExternalLink,
  FileText,
  Gauge,
  Link2,
  List,
  Loader2,
  Merge,
  MessageCircle,
  NotebookText,
  PanelRight,
  RefreshCcw,
  ScanLine,
  Scissors,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { type KeyboardEvent, useMemo, useRef } from 'react';
import { useUiStore, type InsightsDrawerTab, type ChunkDrawerTab } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePricingStore } from '../../stores/pricingStore';
import { indexPad, qualityLabelKey, qualityTone, calculateCompositeQuality } from '../../utils';
import { MODEL_PRICING } from '../../constants';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { formatCost } from '../pipeline/CostBadge';
import { useChunkWatchdog } from '../../hooks/useChunkWatchdog';
import type { TranslationChunk } from '../../types';

interface InsightsDrawerProps {
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

const PANEL_WIDTH = 430;

const DOC_TAB_ORDER: InsightsDrawerTab[] = ['index', 'stats', 'coherence'];
const CHUNK_TAB_ORDER: ChunkDrawerTab[] = ['audit', 'notes'];

const DOC_TAB_BUTTON_IDS: Record<InsightsDrawerTab, string> = {
  index: 'insights-tab-button-index',
  stats: 'insights-tab-button-stats',
  coherence: 'insights-tab-button-coherence',
};

const DOC_TAB_PANEL_IDS: Record<InsightsDrawerTab, string> = {
  index: 'insights-tab-panel-index',
  stats: 'insights-tab-panel-stats',
  coherence: 'insights-tab-panel-coherence',
};

const CHUNK_TAB_BUTTON_IDS: Record<ChunkDrawerTab, string> = {
  audit: 'chunk-tab-button-audit',
  notes: 'chunk-tab-button-notes',
};

const CHUNK_TAB_PANEL_IDS: Record<ChunkDrawerTab, string> = {
  audit: 'chunk-tab-panel-audit',
  notes: 'chunk-tab-panel-notes',
};

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
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
  const setPendingSplitChunkId = useUiStore((state) => state.setPendingSplitChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const allChunksTranslated = chunks.length > 0 && chunks.every((c) => c.currentDraft?.trim());
  const allChunksLocked = chunks.length > 0 && chunks.every((c) => c.translationLocked);
  const unlockedChunksCount = chunks.filter((c) => c.currentDraft?.trim() && !c.translationLocked).length;
  const mergeChunkWithNext = useChunksStore((state) => state.mergeChunkWithNext);
  const currentChunk = chunks.find((c) => c.id === selectedChunkId) ?? chunks[0] ?? null;
  const currentChunkIndex = currentChunk ? chunks.findIndex((c) => c.id === currentChunk.id) : -1;

  const { stuckChunkIds, cancelStuckChunk } = useChunkWatchdog();

  const docTabButtonRefs = useRef<Partial<Record<InsightsDrawerTab, HTMLButtonElement | null>>>({});
  const chunkTabButtonRefs = useRef<Partial<Record<ChunkDrawerTab, HTMLButtonElement | null>>>({});

  const DOC_TAB_ICON: Record<InsightsDrawerTab, React.ReactNode> = {
    index: <List size={16} />,
    stats: <BarChart2 size={16} />,
    coherence: <Link2 size={16} />,
  };
  const DOC_TAB_LABEL: Record<InsightsDrawerTab, string> = {
    index: t('document.insightsTabIndex'),
    stats: t('document.insightsTabStats'),
    coherence: t('document.insightsTabCoherence'),
  };
  const CHUNK_TAB_ICON: Record<ChunkDrawerTab, React.ReactNode> = {
    audit: <ShieldCheck size={16} />,
    notes: <NotebookText size={16} />,
  };
  const CHUNK_TAB_LABEL: Record<ChunkDrawerTab, string> = {
    audit: t('document.insightsTabAudit'),
    notes: t('document.insightsTabNotes'),
  };

  const activateDocTab = (tab: InsightsDrawerTab) => {
    setDocumentDrawerTab(tab);
    docTabButtonRefs.current[tab]?.focus();
  };
  const activateChunkTab = (tab: ChunkDrawerTab) => {
    setChunkDrawerTab(tab);
    chunkTabButtonRefs.current[tab]?.focus();
  };

  const handleDocTabKeyDown = (tab: InsightsDrawerTab, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = DOC_TAB_ORDER.indexOf(tab);
    let next: InsightsDrawerTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = DOC_TAB_ORDER[(idx - 1 + DOC_TAB_ORDER.length) % DOC_TAB_ORDER.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = DOC_TAB_ORDER[(idx + 1) % DOC_TAB_ORDER.length];
    else if (event.key === 'Home') next = DOC_TAB_ORDER[0];
    else if (event.key === 'End') next = DOC_TAB_ORDER[DOC_TAB_ORDER.length - 1];
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
            title={t('document.openChunkPanel')}
          >
            <ShieldCheck size={14} />
            <span className="[writing-mode:vertical-lr] rotate-180 text-[9px] font-bold uppercase tracking-[0.3em]">
              {t('document.chunkPanelTitle')}
            </span>
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
            className="flex h-full overflow-hidden border-l border-editorial-border bg-editorial-bg/95"
            role="region"
            aria-label={chunkLabel}
          >
            <div className="flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
              <div className="flex items-center justify-between gap-3 border-b border-editorial-border px-5 py-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                  {chunkLabel}
                </div>
                <button
                  type="button"
                  onClick={() => setShowChunkDrawer(false)}
                  className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('header.closeDrawer')}
                >
                  <X size={16} />
                </button>
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

              <div className="flex flex-1 flex-col overflow-y-auto bg-editorial-bg/40 custom-scrollbar">
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
                ) : (
                  <NotesTab
                    panelId={CHUNK_TAB_PANEL_IDS.notes}
                    labelledBy={CHUNK_TAB_BUTTON_IDS.notes}
                    currentChunk={currentChunk}
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
            title={t('header.openInsights')}
          >
            <PanelRight size={14} />
            <span className="[writing-mode:vertical-lr] rotate-180 text-[9px] font-bold uppercase tracking-[0.3em]">
              {t('document.insightsDrawerTitle')}
            </span>
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
                <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                  {t('document.insightsDrawerTitle')}
                </div>
                <button
                  type="button"
                  onClick={() => setShowDocumentDrawer(false)}
                  className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('header.closeDrawer')}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2">
                <div role="tablist" aria-orientation="horizontal" aria-label={t('document.insightsDrawerTitle')} className="flex gap-1">
                  {DOC_TAB_ORDER.map((tab) => (
                    <TabButton
                      key={tab}
                      buttonId={DOC_TAB_BUTTON_IDS[tab]}
                      active={documentDrawerTab === tab}
                      onClick={() => activateDocTab(tab)}
                      onKeyDown={(e) => handleDocTabKeyDown(tab, e)}
                      label={DOC_TAB_LABEL[tab]}
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
                    isProcessing={isProcessing}
                    stuckChunkIds={stuckChunkIds}
                    onSelect={(id) => setSelectedChunkId(id)}
                    onSplit={(chunkId) => { setSelectedChunkId(chunkId); setPendingSplitChunkId(chunkId); }}
                    onMerge={(chunkId) => { setSelectedChunkId(chunkId); mergeChunkWithNext(chunkId); }}
                    onCancelStuck={cancelStuckChunk}
                  />
                ) : documentDrawerTab === 'stats' ? (
                  <StatsTab
                    panelId={DOC_TAB_PANEL_IDS.stats}
                    labelledBy={DOC_TAB_BUTTON_IDS.stats}
                    chunks={chunks}
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

// ── Tab Button ─────────────────────────────────────────────────────────────

interface TabButtonProps {
  buttonId: string;
  active: boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  label: string;
  icon: React.ReactNode;
  controls: string;
  buttonRef: (element: HTMLButtonElement | null) => void;
}

function TabButton({ buttonId, active, onClick, onKeyDown, label, icon, controls, buttonRef }: TabButtonProps) {
  return (
    <button
      id={buttonId}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      ref={buttonRef}
      title={label}
      aria-label={label}
      className={`rounded-full border p-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        active
          ? 'border-editorial-ink bg-editorial-ink text-white'
          : 'border-editorial-border text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
      }`}
    >
      {icon}
    </button>
  );
}

// ── Index Tab ──────────────────────────────────────────────────────────────

interface IndexTabProps {
  panelId: string;
  labelledBy: string;
  chunks: TranslationChunk[];
  currentChunkId: string | null;
  isProcessing: boolean;
  stuckChunkIds: Set<string>;
  onSelect: (id: string) => void;
  onSplit: (chunkId: string) => void;
  onMerge: (chunkId: string) => void;
  onCancelStuck: (chunkId: string) => void;
}

function IndexTab({ panelId, labelledBy, chunks, currentChunkId, isProcessing, stuckChunkIds, onSelect, onSplit, onMerge, onCancelStuck }: IndexTabProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  if (chunks.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <List size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('document.indexEmptyTitle')}</p>
        <p className="text-xs leading-relaxed text-editorial-muted/70">{t('document.indexEmptyBody')}</p>
      </div>
    );
  }

  const canEdit = !isProcessing;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} ref={scrollRef} className="overflow-y-auto custom-scrollbar px-4 py-4">
      <ul style={{ height: virtualizer.getTotalSize(), position: 'relative' }} className="w-full">
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const chunk = chunks[virtualRow.index];
          const index = virtualRow.index;
          const isActive = chunk.id === currentChunkId;
          const tone = qualityTone(chunk.judgeResult.status === 'completed' ? chunk.judgeResult.rating : null);
          const wordCount = chunk.originalText.trim() ? chunk.originalText.trim().split(/\s+/).filter(Boolean).length : 0;
          const isLast = index === chunks.length - 1;
          const canMutate = canEdit && chunk.status !== 'completed' && chunk.status !== 'processing';
          const isStuck = stuckChunkIds.has(chunk.id);

          let statusIcon: React.ReactNode;
          if (chunk.status === 'processing') {
            statusIcon = isStuck
              ? <Clock size={13} className="text-editorial-accent shrink-0" />
              : <Loader2 size={13} className="animate-spin text-editorial-warning shrink-0" />;
          } else if (chunk.status === 'completed') {
            statusIcon = <CheckCircle2 size={13} className="text-editorial-success shrink-0" />;
          } else if (chunk.status === 'error') {
            statusIcon = <AlertCircle size={13} className="text-editorial-accent shrink-0" />;
          } else {
            statusIcon = <Circle size={13} className="text-editorial-border shrink-0" />;
          }

          return (
            <li
              key={chunk.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: virtualRow.start, left: 0, right: 0 }}
              className="pb-2"
            >
              <div className={`rounded-2xl border transition-colors ${isActive ? 'border-editorial-ink bg-editorial-ink' : 'border-editorial-border bg-editorial-bg hover:border-editorial-ink/40'}`}>
                <button type="button" onClick={() => onSelect(chunk.id)} className="w-full px-4 pt-3 pb-2 text-left">
                  <div className="flex items-center gap-2">
                    {statusIcon}
                    <span className={`font-display text-sm italic ${isActive ? 'text-white' : 'text-editorial-accent'}`}>
                      {indexPad(index + 1)}
                    </span>
                    <span className={`flex-1 line-clamp-2 text-[11px] leading-snug ${isActive ? 'text-white/80' : 'text-editorial-muted'}`}>
                      {chunk.originalText.replace(/\s+/g, ' ').trim()}
                    </span>
                    <span className={`shrink-0 text-[10px] font-mono ${isActive ? 'text-white/50' : 'text-editorial-muted/60'}`}>
                      {wordCount}w
                    </span>
                  </div>
                  {chunk.judgeResult.status === 'completed' && (
                    <div className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${isActive ? 'text-white/70' : QUALITY_TONE_COLOR[tone]}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone === 'strong' ? 'bg-editorial-success' : tone === 'ok' ? 'bg-editorial-warning' : 'bg-editorial-accent'}`} />
                      {t(qualityLabelKey(chunk.judgeResult.rating))}
                    </div>
                  )}
                  {chunk.translationLocked && (
                    <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] ${isActive ? 'text-emerald-200' : 'text-editorial-success'}`}>
                      <CheckCheck size={12} />
                      {t('document.translationLockedBadge')}
                    </div>
                  )}
                </button>

                {isStuck && chunk.status === 'processing' && (
                  <div className={`flex items-center justify-between gap-2 border-t px-3 py-2 ${isActive ? 'border-white/10' : 'border-editorial-border/60'}`}>
                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${isActive ? 'text-orange-200' : 'text-editorial-accent'}`}>
                      <Clock size={11} />
                      {t('document.watchdogStuck')}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelStuck(chunk.id); }}
                      aria-label={t('document.watchdogCancel')}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${isActive ? 'border-orange-300/40 text-orange-200 hover:bg-white/10' : 'border-editorial-accent/40 text-editorial-accent hover:bg-editorial-accent/10'}`}
                    >
                      {t('document.watchdogCancel')}
                    </button>
                  </div>
                )}

                {canMutate && (
                  <div className={`flex gap-1.5 border-t px-3 py-2 ${isActive ? 'border-white/10' : 'border-editorial-border/60'}`}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSplit(chunk.id); }}
                      title={t('pipeline.splitChunkTooltip')}
                      aria-label={t('pipeline.splitChunk')}
                      className={`rounded-full border p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${isActive ? 'border-white/20 text-white/60 hover:bg-white/10 hover:text-white' : 'border-editorial-border text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'}`}
                    >
                      <Scissors size={13} />
                    </button>
                    {!isLast && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onMerge(chunk.id); }}
                        title={t('pipeline.mergeNextTooltip')}
                        aria-label={t('pipeline.mergeNext')}
                        className={`rounded-full border p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${isActive ? 'border-white/20 text-white/60 hover:bg-white/10 hover:text-white' : 'border-editorial-border text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'}`}
                      >
                        <Merge size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Stats Tab ──────────────────────────────────────────────────────────────

interface StatsTabProps {
  panelId: string;
  labelledBy: string;
  chunks: TranslationChunk[];
}

function StatsTab({ panelId, labelledBy, chunks }: StatsTabProps) {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  const sourceWords = chunks.reduce((acc, c) => acc + countWords(c.originalText), 0);
  const translatedWords = chunks.reduce((acc, c) => acc + countWords(c.currentDraft || ''), 0);
  const coverageRatio = sourceWords > 0 ? Math.round((translatedWords / sourceWords) * 100) : 0;
  const total = chunks.length;
  const idleCount = chunks.filter((c) => c.status === 'ready').length;
  const processingCount = chunks.filter((c) => c.status === 'processing').length;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const errorCount = chunks.filter((c) => c.status === 'error').length;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const compositeQuality = calculateCompositeQuality(chunks);
  const compositeLabel = compositeQuality ? t(qualityLabelKey(compositeQuality)) : null;
  const compositeTone = qualityTone(compositeQuality);

  let totalInput = 0;
  let totalOutput = 0;
  let estimatedCostUsd = 0;
  const modelNames = new Set<string>();
  for (const chunk of chunks) {
    for (const [stageId, result] of Object.entries(chunk.stageResults)) {
      const stage = config.stages.find((s) => s.id === stageId);
      if (stage) {
        modelNames.add(`${stage.provider} / ${stage.model}`);
        if (result.tokenUsage) {
          totalInput += result.tokenUsage.inputTokens ?? 0;
          totalOutput += result.tokenUsage.outputTokens ?? 0;
          const pricing = MODEL_PRICING[`${stage.provider}/${stage.model}`];
          if (pricing) estimatedCostUsd += (result.tokenUsage.inputTokens * pricing.input + result.tokenUsage.outputTokens * pricing.output) / 1_000_000;
        }
      }
    }
    if (chunk.judgeResult.tokenUsage) {
      const ju = chunk.judgeResult.tokenUsage;
      totalInput += ju.inputTokens ?? 0;
      totalOutput += ju.outputTokens ?? 0;
      const judgePricing = MODEL_PRICING[`${config.judgeProvider}/${config.judgeModel}`];
      if (judgePricing) estimatedCostUsd += (ju.inputTokens * judgePricing.input + ju.outputTokens * judgePricing.output) / 1_000_000;
      modelNames.add(`${config.judgeProvider} / ${config.judgeModel}`);
    }
  }
  const totalTokens = totalInput + totalOutput;

  if (chunks.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <BarChart2 size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('document.indexEmptyTitle')}</p>
        <p className="text-xs leading-relaxed text-editorial-muted/70">{t('document.indexEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="space-y-3 px-5 py-5">
      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
          <FileText size={12} /> {t('document.infoLabel')}
        </div>
        <dl className="space-y-2">
          <StatRow label={t('document.infoSourceWords')} value={sourceWords.toLocaleString()} />
          <StatRow label={t('document.infoTranslatedWords')} value={`${translatedWords.toLocaleString()} (${coverageRatio}%)`} />
          <StatRow label={t('document.infoChunks')} value={`${completedCount} / ${total}`} />
        </dl>
      </section>

      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
          <BarChart2 size={12} /> {t('pipeline.chunkStatus.completed')}
        </div>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-editorial-border/40">
          <div className="h-full rounded-full bg-editorial-success transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mb-2 font-display text-lg italic text-editorial-ink">{progressPct}%</div>
        <div className="flex flex-wrap gap-3">
          {idleCount > 0 && <div className="flex items-center gap-1.5 text-[10px] text-editorial-muted"><Circle size={10} className="text-editorial-muted/50" /><span className="font-bold">{idleCount}</span> {t('pipeline.chunkStatus.ready')}</div>}
          {processingCount > 0 && <div className="flex items-center gap-1.5 text-[10px] text-editorial-warning"><Loader2 size={10} className="animate-spin" /><span className="font-bold">{processingCount}</span> {t('pipeline.chunkStatus.processing')}</div>}
          {completedCount > 0 && <div className="flex items-center gap-1.5 text-[10px] text-editorial-success"><CheckCircle2 size={10} /><span className="font-bold">{completedCount}</span> {t('pipeline.chunkStatus.completed')}</div>}
          {errorCount > 0 && <div className="flex items-center gap-1.5 text-[10px] text-editorial-accent"><AlertCircle size={10} /><span className="font-bold">{errorCount}</span> {t('pipeline.chunkStatus.error')}</div>}
        </div>
      </section>

      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
          <Gauge size={12} /> {t('document.infoQuality')}
        </div>
        {compositeLabel
          ? <div className={`font-display text-lg italic ${QUALITY_TONE_COLOR[compositeTone]}`}>{compositeLabel}</div>
          : <div className="font-display text-lg italic text-editorial-muted/40">—</div>}
      </section>

      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
          <Cpu size={12} /> {t('header.tokenCount')}
        </div>
        <dl className="space-y-2">
          <StatRow
            label={t('header.tokenCount')}
            value={totalTokens > 0 ? totalTokens.toLocaleString() : (() => {
              const est = [...costEstimate.stages, ...(costEstimate.judge ? [costEstimate.judge] : [])].reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
              return est > 0 ? `~${est.toLocaleString()}` : '—';
            })()}
          />
          {totalTokens > 0 && (
            <div className="flex items-baseline gap-1 pl-3">
              <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted/60">in</dt>
              <dd className="font-display text-sm italic text-editorial-muted">{totalInput.toLocaleString()}</dd>
              <dt className="ml-2 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted/60">out</dt>
              <dd className="font-display text-sm italic text-editorial-muted">{totalOutput.toLocaleString()}</dd>
            </div>
          )}
          <StatRow
            label={t('header.estimatedCost')}
            value={totalTokens > 0
              ? `$${estimatedCostUsd.toFixed(4)}`
              : costEstimate.isFree ? t('cost.free')
              : costEstimate.totalUsd === null ? t('cost.unknown')
              : `~${formatCost(costEstimate.totalUsd)}`}
          />
        </dl>
        {modelNames.size > 0 && (
          <div className="mt-3 space-y-1">
            {Array.from(modelNames).map((name) => (
              <div key={name} className="text-[10px] text-editorial-muted/70 font-mono truncate">{name}</div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">{label}</dt>
      <dd className="font-display text-sm italic text-editorial-ink">{value}</dd>
    </div>
  );
}

// ── Coherence Tab ──────────────────────────────────────────────────────────

interface CoherenceTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  allChunksTranslated: boolean;
  allChunksLocked: boolean;
  unlockedChunksCount: number;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null) => void;
  onRunCoherenceAudit: () => void;
}

function CoherenceTab({ panelId, labelledBy, currentChunk, isProcessing, allChunksTranslated, allChunksLocked, unlockedChunksCount, onSelectChunk, onFocusIssue, onRunCoherenceAudit }: CoherenceTabProps) {
  const { t } = useTranslation();
  const coherence = currentChunk?.coherenceResult;
  const coherenceDisabled = isProcessing || !allChunksTranslated;
  const coherenceTitle = coherenceDisabled && !isProcessing
    ? t('coherence.translationsRequired')
    : coherence?.status === 'completed' || coherence?.status === 'error'
      ? t('coherence.rerun')
      : t('coherence.runAudit');

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-5 py-5">
      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            <Link2 size={12} /> {t('coherence.title')}
          </div>
          <button
            type="button"
            onClick={onRunCoherenceAudit}
            disabled={coherenceDisabled}
            title={coherenceTitle}
            aria-label={t('coherence.runAudit')}
            className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-30"
          >
            {coherence?.status === 'processing' ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
          </button>
        </div>

        {allChunksTranslated && !allChunksLocked && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-editorial-warning/30 bg-editorial-warning/10 p-3 text-sm text-editorial-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{t('coherence.unlockedWarning', { count: unlockedChunksCount })}</span>
          </div>
        )}

        {!coherence || coherence.status === 'idle' ? (
          <p className="mt-3 text-[11px] text-editorial-muted/70 leading-relaxed">
            {!allChunksTranslated ? t('coherence.translationsRequired') : t('coherence.idle')}
          </p>
        ) : coherence.status === 'processing' ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-editorial-muted">
            <Loader2 size={13} className="animate-spin shrink-0" /> {t('coherence.running')}
          </div>
        ) : coherence.status === 'error' ? (
          <div className="mt-3 rounded-2xl border border-editorial-accent/30 bg-editorial-textbox/40 p-3 text-sm text-editorial-accent">
            {coherence.error || t('errors.coherenceFailed')}
          </div>
        ) : coherence.issues.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-editorial-success">
            <CheckCircle2 size={14} /> {t('coherence.noIssues')}
          </div>
        ) : currentChunk ? (
          <IssueList issues={coherence.issues} chunkId={currentChunk.id} onSelectChunk={onSelectChunk} onFocusIssue={onFocusIssue} />
        ) : null}
      </section>
    </div>
  );
}

// ── Audit Tab ──────────────────────────────────────────────────────────────

interface AuditTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  onReauditChunk: (chunkId: string) => void;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null) => void;
}

function AuditTab({ panelId, labelledBy, currentChunk, isProcessing, onReauditChunk, onSelectChunk, onFocusIssue }: AuditTabProps) {
  const { t } = useTranslation();

  if (!currentChunk) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-6 py-8 text-sm text-editorial-muted">
        {t('document.insightsAuditEmpty')}
      </div>
    );
  }

  const tone = qualityTone(currentChunk.judgeResult.rating);
  const qualityLabel = currentChunk.judgeResult.status === 'completed'
    ? t(qualityLabelKey(currentChunk.judgeResult.rating))
    : t('audit.ratingNone');

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-5 py-5">
      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">{t('audit.title')}</div>
            <div className={`mt-2 font-display text-xl italic ${QUALITY_TONE_COLOR[tone]}`}>{qualityLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => onReauditChunk(currentChunk.id)}
            disabled={isProcessing || !currentChunk.currentDraft}
            title={t('pipeline.reauditChunk')}
            aria-label={t('pipeline.reauditChunk')}
            className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-30"
          >
            <RefreshCcw size={14} />
          </button>
        </div>

        {currentChunk.judgeResult.status === 'error' && (
          <div className="mt-4 rounded-2xl border border-editorial-accent/30 bg-editorial-textbox/40 p-4 text-sm text-editorial-accent">
            {currentChunk.judgeResult.error || t('audit.auditFailed')}
          </div>
        )}
        {currentChunk.judgeResult.status !== 'error' && currentChunk.judgeResult.status !== 'completed' && (
          <div className="mt-4 rounded-2xl border border-editorial-border bg-editorial-bg/60 p-4 text-sm text-editorial-muted">
            {t('document.insightsAuditEmpty')}
          </div>
        )}
        {currentChunk.judgeResult.status === 'completed' && currentChunk.judgeResult.issues.length === 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm text-editorial-success">
            <CheckCircle2 size={14} /> {t('document.insightsAuditNoIssues')}
          </div>
        )}
        {currentChunk.judgeResult.issues.length > 0 && (
          <IssueList issues={currentChunk.judgeResult.issues} chunkId={currentChunk.id} onSelectChunk={onSelectChunk} onFocusIssue={onFocusIssue} />
        )}
      </section>
    </div>
  );
}

// ── Notes Tab ──────────────────────────────────────────────────────────────

interface NotesTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

function NotesTab({ panelId, labelledBy, currentChunk }: NotesTabProps) {
  const { t } = useTranslation();
  const footnotes = currentChunk?.footnotes ?? [];

  if (!currentChunk || footnotes.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <NotebookText size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('document.insightsNotesEmpty')}</p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="space-y-2 px-5 py-5">
      {footnotes.map((note) => (
        <article key={note.id} className="rounded-2xl border border-editorial-border bg-editorial-bg px-4 py-3">
          <div className="mb-1.5 font-display text-sm italic text-editorial-accent">{note.marker}</div>
          <p className="text-[12px] leading-relaxed text-editorial-ink">{note.text}</p>
        </article>
      ))}
    </div>
  );
}

// ── IssueList ──────────────────────────────────────────────────────────────

interface IssueListProps {
  issues: TranslationChunk['judgeResult']['issues'];
  chunkId: string;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null) => void;
}

function IssueList({ issues, chunkId, onSelectChunk, onFocusIssue }: IssueListProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 space-y-3">
      {issues.map((issue, index) => (
        <article key={`${issue.type}-${index}`} className="rounded-2xl border border-editorial-border bg-editorial-bg/80 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-full p-1 ${issue.severity === 'high' ? 'bg-editorial-accent text-white' : issue.severity === 'medium' ? 'bg-editorial-warning/80 text-white' : 'bg-editorial-border text-editorial-muted'}`}>
                {issue.type === 'fluency' ? <MessageCircle size={11} /> :
                 issue.type === 'accuracy' ? <AlertTriangle size={11} /> :
                 issue.type === 'grammar' ? <AlertCircle size={11} /> :
                 issue.type === 'consistency' ? <Link2 size={11} /> :
                 <BookOpen size={11} />}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-ink">{issue.type}</span>
            </div>
            <button
              type="button"
              onClick={() => { onSelectChunk(chunkId); onFocusIssue(chunkId, extractIssueFocusQuery(issue)); }}
              title={t('audit.openChunk')}
              aria-label={t('audit.openChunk')}
              className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ExternalLink size={13} />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-editorial-ink">{issue.description}</p>
          {issue.suggestedFix && (
            <div className="mt-3 rounded-xl border border-editorial-border/70 bg-editorial-bg px-3 py-2 text-sm leading-relaxed text-editorial-muted">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-accent">{t('audit.fix')}</span>: {issue.suggestedFix}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractIssueFocusQuery(issue: TranslationChunk['judgeResult']['issues'][number]): string | null {
  const candidates = [
    ...Array.from(issue.description.matchAll(/"([^"]{3,})"/g)).map((m) => m[1]),
    ...Array.from(issue.suggestedFix?.matchAll(/"([^"]{3,})"/g) ?? []).map((m) => m[1]),
  ].map((v) => v.trim()).filter(Boolean);
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}
