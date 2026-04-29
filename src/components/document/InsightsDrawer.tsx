import { AlertTriangle, CheckCheck, PanelRight, RefreshCcw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { type KeyboardEvent, useRef } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { indexPad, qualityLabelKey, qualityTone } from '../../utils';
import type { TranslationChunk } from '../../types';

interface InsightsDrawerProps {
  onReauditChunk: (chunkId: string) => void;
}

const PANEL_WIDTH = 480;

type InsightsTab = 'index' | 'audit';

const TAB_BUTTON_IDS: Record<InsightsTab, string> = {
  index: 'insights-tab-button-index',
  audit: 'insights-tab-button-audit',
};

const TAB_PANEL_IDS: Record<InsightsTab, string> = {
  index: 'insights-tab-panel-index',
  audit: 'insights-tab-panel-audit',
};

const TAB_ORDER: InsightsTab[] = ['index', 'audit'];

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

export function InsightsDrawer({ onReauditChunk }: InsightsDrawerProps) {
  const { t } = useTranslation();
  const tabButtonRefs = useRef<Record<InsightsTab, HTMLButtonElement | null>>({
    index: null,
    audit: null,
  });
  const showInsightsDrawer = useUiStore((state) => state.showInsightsDrawer);
  const insightsDrawerTab = useUiStore((state) => state.insightsDrawerTab);
  const setShowInsightsDrawer = useUiStore((state) => state.setShowInsightsDrawer);
  const setInsightsDrawerTab = useUiStore((state) => state.setInsightsDrawerTab);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const focusIssueInChunk = useUiStore((state) => state.focusIssueInChunk);
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const currentChunk =
    chunks.find((chunk) => chunk.id === selectedChunkId) ?? chunks[0] ?? null;

  const activateTab = (tab: InsightsTab) => {
    setInsightsDrawerTab(tab);
    tabButtonRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (
    currentTab: InsightsTab,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    let nextTab: InsightsTab | null = null;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        nextTab = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        nextTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
        break;
      case 'Home':
        nextTab = TAB_ORDER[0];
        break;
      case 'End':
        nextTab = TAB_ORDER[TAB_ORDER.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    activateTab(nextTab);
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {!showInsightsDrawer && (
          <motion.button
            key="insights-tab"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShowInsightsDrawer(true)}
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
      {showInsightsDrawer && (
        <motion.aside
          key="insights-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: PANEL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="flex h-full overflow-hidden border-l border-editorial-border bg-editorial-bg/95"
          role="region"
          aria-label={t('document.insightsDrawerTitle')}
        >
          <div
            className="flex h-full flex-col"
            style={{ width: PANEL_WIDTH }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-editorial-border px-6 py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                  {t('document.insightsDrawerTitle')}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-editorial-muted">
                  {t('document.insightsDrawerHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInsightsDrawer(false)}
                className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label={t('header.closeDrawer')}
              >
                <X size={16} />
              </button>
            </div>

            <div
              role="tablist"
              aria-orientation="horizontal"
              aria-label={t('document.insightsDrawerTitle')}
              className="flex gap-1 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2"
            >
              <TabButton
                tab="index"
                active={insightsDrawerTab === 'index'}
                onClick={() => activateTab('index')}
                onKeyDown={(event) => handleTabKeyDown('index', event)}
                label={t('document.insightsTabIndex')}
                controls={TAB_PANEL_IDS.index}
                buttonRef={(element) => {
                  tabButtonRefs.current.index = element;
                }}
              />
              <TabButton
                tab="audit"
                active={insightsDrawerTab === 'audit'}
                onClick={() => activateTab('audit')}
                onKeyDown={(event) => handleTabKeyDown('audit', event)}
                label={t('document.insightsTabAudit')}
                controls={TAB_PANEL_IDS.audit}
                buttonRef={(element) => {
                  tabButtonRefs.current.audit = element;
                }}
              />
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto bg-editorial-bg/40 custom-scrollbar">
              {insightsDrawerTab === 'index' ? (
                <IndexTab
                  panelId={TAB_PANEL_IDS.index}
                  labelledBy={TAB_BUTTON_IDS.index}
                  chunks={chunks}
                  currentChunkId={currentChunk?.id ?? null}
                  onSelect={(id) => setSelectedChunkId(id)}
                />
              ) : (
                <AuditTab
                  panelId={TAB_PANEL_IDS.audit}
                  labelledBy={TAB_BUTTON_IDS.audit}
                  currentChunk={currentChunk}
                  isProcessing={isProcessing}
                  onReauditChunk={onReauditChunk}
                  onSelectChunk={setSelectedChunkId}
                  onFocusIssue={focusIssueInChunk}
                />
              )}
            </div>
          </div>
        </motion.aside>
      )}
      </AnimatePresence>
    </>
  );
}

interface TabButtonProps {
  tab: InsightsTab;
  active: boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  label: string;
  controls: string;
  buttonRef: (element: HTMLButtonElement | null) => void;
}

function TabButton({
  tab,
  active,
  onClick,
  onKeyDown,
  label,
  controls,
  buttonRef,
}: TabButtonProps) {
  return (
    <button
      id={TAB_BUTTON_IDS[tab]}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      ref={buttonRef}
      className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        active
          ? 'bg-editorial-ink text-white'
          : 'text-editorial-muted hover:text-editorial-ink'
      }`}
    >
      {label}
    </button>
  );
}

interface IndexTabProps {
  panelId: string;
  labelledBy: string;
  chunks: TranslationChunk[];
  currentChunkId: string | null;
  onSelect: (id: string) => void;
}

function IndexTab({ panelId, labelledBy, chunks, currentChunkId, onSelect }: IndexTabProps) {
  const { t } = useTranslation();

  if (chunks.length === 0) {
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className="px-6 py-8 text-sm text-editorial-muted"
      >
        {t('document.emptyTitle')}
      </div>
    );
  }

  return (
    <ul
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-2 px-4 py-4"
    >
      {chunks.map((chunk, index) => {
        const isActive = chunk.id === currentChunkId;
        const ratingLabel =
          chunk.judgeResult.status === 'completed'
            ? t(qualityLabelKey(chunk.judgeResult.rating))
            : t(`pipeline.chunkStatus.${chunk.status}`);
        return (
          <li key={chunk.id}>
            <button
              type="button"
              onClick={() => onSelect(chunk.id)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                isActive
                  ? 'border-editorial-ink bg-editorial-ink text-white'
                  : 'border-editorial-border bg-editorial-bg hover:border-editorial-ink/40'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-80">
                {t('pipeline.unit')} {indexPad(index + 1)}
              </div>
              <div className="mt-1 text-sm leading-snug">
                {truncateChunk(chunk.originalText)}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.2em] opacity-75">
                {ratingLabel}
              </div>
              {chunk.translationLocked ? (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                  <CheckCheck size={12} />
                  {t('document.translationLockedBadge')}
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface AuditTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
  isProcessing: boolean;
  onReauditChunk: (chunkId: string) => void;
  onSelectChunk: (id: string) => void;
  onFocusIssue: (chunkId: string, query?: string | null) => void;
}

function AuditTab({
  panelId,
  labelledBy,
  currentChunk,
  isProcessing,
  onReauditChunk,
  onSelectChunk,
  onFocusIssue,
}: AuditTabProps) {
  const { t } = useTranslation();

  if (!currentChunk) {
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className="px-6 py-8 text-sm text-editorial-muted"
      >
        {t('document.insightsAuditEmpty')}
      </div>
    );
  }

  const tone = qualityTone(currentChunk.judgeResult.rating);
  const qualityLabel =
    currentChunk.judgeResult.status === 'completed'
      ? t(qualityLabelKey(currentChunk.judgeResult.rating))
      : t('audit.ratingNone');

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="space-y-5 px-5 py-5"
    >
      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('audit.title')}
            </div>
            <div className={`mt-2 font-display text-xl italic ${QUALITY_TONE_COLOR[tone]}`}>
              {qualityLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onReauditChunk(currentChunk.id)}
            disabled={isProcessing || !currentChunk.currentDraft}
            className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
          >
            <RefreshCcw size={12} className="inline mr-1" />
            {t('pipeline.reauditChunk')}
          </button>
        </div>

        {currentChunk.judgeResult.status === 'error' && (
          <div className="mt-4 rounded-2xl border border-editorial-accent/30 bg-editorial-textbox/40 p-4 text-sm text-editorial-accent">
            {currentChunk.judgeResult.error || t('audit.auditFailed')}
          </div>
        )}

        {currentChunk.judgeResult.status !== 'error' &&
        currentChunk.judgeResult.status !== 'completed' ? (
          <div className="mt-4 rounded-2xl border border-editorial-border bg-editorial-bg/60 p-4 text-sm text-editorial-muted">
            {t('document.insightsAuditEmpty')}
          </div>
        ) : currentChunk.judgeResult.issues.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-editorial-border bg-editorial-bg/60 p-4 text-sm text-editorial-muted">
            {t('document.insightsAuditNoIssues')}
          </div>
        ) : null}

        {currentChunk.judgeResult.issues.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {t('document.insightsAuditIssues')}
            </div>
            {currentChunk.judgeResult.issues.map((issue, index) => (
              <article
                key={`${issue.type}-${index}`}
                className="rounded-2xl border border-editorial-border bg-editorial-bg/80 p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                      issue.severity === 'high'
                        ? 'bg-editorial-accent text-white'
                        : 'bg-editorial-ink text-white'
                    }`}
                  >
                    {issue.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectChunk(currentChunk.id);
                      onFocusIssue(currentChunk.id, extractIssueFocusQuery(issue));
                    }}
                    className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-editorial-muted transition-colors hover:text-editorial-ink"
                  >
                    {t('audit.openChunk')}
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-editorial-ink">
                  {issue.description}
                </p>
                {issue.suggestedFix && (
                  <div className="mt-3 rounded-xl border border-editorial-border/70 bg-editorial-bg px-3 py-2 text-sm leading-relaxed text-editorial-muted">
                    <span className="font-bold uppercase tracking-[0.2em] text-[10px] text-editorial-accent">
                      {t('audit.fix')}
                    </span>
                    : {issue.suggestedFix}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function truncateChunk(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 80) return normalized;
  return `${normalized.slice(0, 77)}...`;
}

function extractIssueFocusQuery(issue: TranslationChunk['judgeResult']['issues'][number]): string | null {
  const candidates = [
    ...Array.from(issue.description.matchAll(/"([^"]{3,})"/g)).map((match) => match[1]),
    ...Array.from(issue.suggestedFix?.matchAll(/"([^"]{3,})"/g) ?? []).map((match) => match[1]),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}
