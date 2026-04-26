import { AlertTriangle, RefreshCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer, ProcessingLine } from '../common';
import { useUiStore } from '../../stores/uiStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { indexPad, qualityLabelKey, qualityTone } from '../../utils';
import type { TranslationChunk } from '../../types';

interface InsightsDrawerProps {
  onReauditChunk: (chunkId: string) => void;
}

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

export function InsightsDrawer({ onReauditChunk }: InsightsDrawerProps) {
  const { t } = useTranslation();
  const showInsightsDrawer = useUiStore((state) => state.showInsightsDrawer);
  const insightsDrawerTab = useUiStore((state) => state.insightsDrawerTab);
  const setShowInsightsDrawer = useUiStore((state) => state.setShowInsightsDrawer);
  const setInsightsDrawerTab = useUiStore((state) => state.setInsightsDrawerTab);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const setSelectedChunkId = useUiStore((state) => state.setSelectedChunkId);
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const stages = usePipelineStore((state) => state.config.stages);

  const currentChunk =
    chunks.find((chunk) => chunk.id === selectedChunkId) ?? chunks[0] ?? null;

  return (
    <Drawer
      open={showInsightsDrawer}
      side="right"
      onClose={() => setShowInsightsDrawer(false)}
      ariaLabelledBy="insights-drawer-title"
      ariaDescribedBy="insights-drawer-hint"
    >
      <div className="flex items-start justify-between gap-3 border-b border-editorial-border px-6 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.insightsDrawerTitle')}
          </div>
          <h2
            id="insights-drawer-title"
            className="mt-1 font-display text-2xl italic tracking-tight text-editorial-ink"
          >
            {t('document.insightsDrawerTitle')}
          </h2>
          <p
            id="insights-drawer-hint"
            className="mt-1 text-xs leading-relaxed text-editorial-muted"
          >
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
        aria-label={t('document.insightsDrawerTitle')}
        className="flex gap-1 border-b border-editorial-border bg-editorial-bg/60 px-4 py-2"
      >
        <TabButton
          active={insightsDrawerTab === 'index'}
          onClick={() => setInsightsDrawerTab('index')}
          label={t('document.insightsTabIndex')}
          controls="insights-tab-index"
        />
        <TabButton
          active={insightsDrawerTab === 'audit'}
          onClick={() => setInsightsDrawerTab('audit')}
          label={t('document.insightsTabAudit')}
          controls="insights-tab-audit"
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto bg-editorial-bg/40 custom-scrollbar">
        {insightsDrawerTab === 'index' ? (
          <IndexTab
            chunks={chunks}
            currentChunkId={currentChunk?.id ?? null}
            onSelect={(id) => setSelectedChunkId(id)}
          />
        ) : (
          <AuditTab
            currentChunk={currentChunk}
            stages={stages}
            isProcessing={isProcessing}
            onReauditChunk={onReauditChunk}
          />
        )}
      </div>
    </Drawer>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  controls: string;
}

function TabButton({ active, onClick, label, controls }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
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
  chunks: TranslationChunk[];
  currentChunkId: string | null;
  onSelect: (id: string) => void;
}

function IndexTab({ chunks, currentChunkId, onSelect }: IndexTabProps) {
  const { t } = useTranslation();

  if (chunks.length === 0) {
    return (
      <div
        id="insights-tab-index"
        role="tabpanel"
        className="px-6 py-8 text-sm text-editorial-muted"
      >
        {t('document.emptyTitle')}
      </div>
    );
  }

  return (
    <ul
      id="insights-tab-index"
      role="tabpanel"
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface AuditTabProps {
  currentChunk: TranslationChunk | null;
  stages: ReturnType<typeof usePipelineStore.getState>['config']['stages'];
  isProcessing: boolean;
  onReauditChunk: (chunkId: string) => void;
}

function AuditTab({ currentChunk, stages, isProcessing, onReauditChunk }: AuditTabProps) {
  const { t } = useTranslation();

  if (!currentChunk) {
    return (
      <div
        id="insights-tab-audit"
        role="tabpanel"
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
  const enabledStages = stages.filter((stage) => stage.enabled);

  return (
    <div
      id="insights-tab-audit"
      role="tabpanel"
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
          currentChunk.judgeResult.issues.length === 0 && (
            <div className="mt-4 rounded-2xl border border-editorial-border bg-editorial-bg/60 p-4 text-sm text-editorial-muted">
              {t('document.insightsAuditNoIssues')}
            </div>
          )}

        {currentChunk.judgeResult.issues.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {t('document.insightsAuditIssues')}
            </div>
            {currentChunk.judgeResult.issues.map((issue, index) => (
              <article
                key={`${issue.type}-${index}`}
                className="rounded-2xl border border-editorial-border bg-editorial-bg/80 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                      issue.severity === 'high'
                        ? 'bg-editorial-accent text-white'
                        : 'bg-editorial-ink text-white'
                    }`}
                  >
                    {issue.type}
                  </span>
                </div>
                <p className="font-display text-base italic leading-relaxed text-editorial-ink">
                  {issue.description}
                </p>
                {issue.suggestedFix && (
                  <div className="mt-3 border-l-2 border-editorial-accent pl-3 text-sm text-editorial-muted">
                    <span className="font-bold uppercase tracking-[0.2em] text-[10px]">
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

      {enabledStages.length > 0 && (
        <section className="rounded-[20px] border border-editorial-border bg-editorial-bg p-5">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.stageTrace')}
          </div>
          <div className="space-y-3">
            {enabledStages.map((stage) => {
              const result = currentChunk.stageResults[stage.id];
              if (!result || result.status === 'idle') return null;
              return (
                <article
                  key={stage.id}
                  className={`rounded-2xl border p-4 ${
                    result.status === 'error'
                      ? 'border-editorial-accent/40 bg-editorial-textbox/40'
                      : 'border-editorial-border bg-editorial-bg/80'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-display text-base italic text-editorial-accent">
                      {stage.name}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                      {result.status}
                    </span>
                  </div>
                  <div className="text-sm leading-relaxed text-editorial-ink">
                    {result.status === 'processing' ? (
                      <ProcessingLine />
                    ) : result.status === 'error' ? (
                      <div className="flex items-start gap-2 text-editorial-accent">
                        <AlertTriangle size={14} className="mt-1 shrink-0" />
                        <span className="font-mono text-xs">
                          {result.error || t('errors.unknownError')}
                        </span>
                      </div>
                    ) : (
                      result.content
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function truncateChunk(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 80) return normalized;
  return `${normalized.slice(0, 77)}...`;
}
