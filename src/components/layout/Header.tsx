import {
  FolderOpen,
  Globe,
  HelpCircle,
  LayoutTemplate,
  LibraryBig,
  Save,
  Settings,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { ImportPreviewDialog } from '../document';
import { PipelineActions } from '../pipeline';
import { calculateCompositeQuality, qualityLabelKey } from '../../utils';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';
import { HelpGuide } from '../help';
import { MODEL_PRICING } from '../../constants';

interface PendingImport {
  fileName: string;
  text: string;
  useChunking: boolean;
  targetChunkCount: number;
}

interface HeaderProps {
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
}

export function Header({ onRunPipeline, onRunAuditOnly, onCancelPipeline }: HeaderProps = {}) {
  const { config, setConfig } = usePipelineStore();
  const { chunks, isProcessing, loadDocument } = useChunksStore();
  const {
    setShowSettings,
    setShowHelp,
    showHelp,
    viewMode,
    setViewMode,
    showConfigDrawer,
    setShowConfigDrawer,
  } = useUiStore();
  const {
    currentProjectId,
    setShowProjectPanel,
    saveCurrentProject,
    projects,
    saveState,
  } = useProjectStore();
  const setShowLibraryPanel = useLibraryStore((state) => state.setShowLibraryPanel);
  const { t, i18n } = useTranslation();
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  const currentProject = projects.find((project) => project.id === currentProjectId);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'it' : 'en');
  };

  const handleImport = async () => {
    try {
      const imported = await importTextFile();
      if (imported) {
        setPendingImport({
          fileName: imported.name,
          text: imported.text,
          useChunking: config.useChunking !== false,
          targetChunkCount: config.targetChunkCount ?? 0,
        });
      }
    } catch (err: any) {
      toast.error(t('files.importError'), { description: err.message });
    }
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    setConfig((prev) => ({
      ...prev,
      useChunking: pendingImport.useChunking,
      targetChunkCount: pendingImport.targetChunkCount,
    }));
    loadDocument(pendingImport.text, {
      useChunking: pendingImport.useChunking,
      targetChunkCount: pendingImport.targetChunkCount,
    });
    setPendingImport(null);
    toast.success(t('files.imported'));
  };

  const handleExport = async (type: 'txt' | 'md' | 'bilingual') => {
    try {
      const ok =
        type === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, type);
      if (ok) toast.success(t('files.exported'));
    } catch (err: any) {
      toast.error(t('files.exportError'), { description: err.message });
    }
  };

  const handleSave = async () => {
    try {
      await saveCurrentProject();
      toast.success(t('projects.saved'));
    } catch (err: any) {
      toast.error(t('projects.saveFailed'), { description: err?.message });
    }
  };

  const importLabel = t('files.import');
  const projectsLabel = t('projects.title');
  const saveLabel = t('projects.save');
  const langLabel = t('language.label');
  const settingsLabel = t('header.settings');
  const helpLabel = t('help.title');
  const openConfigLabel = t('header.openConfig');
  const libraryLabel = t('library.openLibrary');
  const sandboxLabel = viewMode === 'sandbox' ? t('header.exitSandbox') : t('header.sandbox');

  const sourceWords = useMemo(
    () => chunks.reduce((acc, chunk) => acc + countWords(chunk.originalText), 0),
    [chunks],
  );
  const translatedWords = useMemo(
    () => chunks.reduce((acc, chunk) => acc + countWords(chunk.currentDraft || ''), 0),
    [chunks],
  );
  const completedCount = chunks.filter((chunk) => chunk.status === 'completed').length;
  const compositeQuality = useMemo(() => calculateCompositeQuality(chunks), [chunks]);
  const compositeLabel = compositeQuality ? t(qualityLabelKey(compositeQuality)) : null;

  const totalTokens = useMemo(
    () =>
      chunks.reduce((sum, chunk) => {
        const stageSum = Object.values(chunk.stageResults).reduce(
          (s, r) => s + (r.tokenUsage?.inputTokens ?? 0) + (r.tokenUsage?.outputTokens ?? 0),
          0,
        );
        const judgeSum =
          (chunk.judgeResult.tokenUsage?.inputTokens ?? 0) +
          (chunk.judgeResult.tokenUsage?.outputTokens ?? 0);
        return sum + stageSum + judgeSum;
      }, 0),
    [chunks],
  );

  const estimatedCostUsd = useMemo(
    () =>
      chunks.reduce((total, chunk) => {
        let cost = 0;
        for (const [stageId, result] of Object.entries(chunk.stageResults)) {
          const stage = config.stages.find((s) => s.id === stageId);
          if (!stage || !result.tokenUsage) continue;
          const pricing = MODEL_PRICING[`${stage.provider}/${stage.model}`];
          if (!pricing) continue;
          cost +=
            (result.tokenUsage.inputTokens * pricing.input +
              result.tokenUsage.outputTokens * pricing.output) /
            1_000_000;
        }
        const judgeUsage = chunk.judgeResult.tokenUsage;
        if (judgeUsage) {
          const judgePricing = MODEL_PRICING[`${config.judgeProvider}/${config.judgeModel}`];
          if (judgePricing) {
            cost +=
              (judgeUsage.inputTokens * judgePricing.input +
                judgeUsage.outputTokens * judgePricing.output) /
              1_000_000;
          }
        }
        return total + cost;
      }, 0),
    [chunks, config.stages, config.judgeProvider, config.judgeModel],
  );

  const saveStatusLabel =
    saveState === 'dirty'
      ? t('projects.statusDirty')
      : saveState === 'saving'
        ? t('projects.statusSaving')
        : saveState === 'error'
          ? t('projects.statusError')
          : currentProjectId
            ? t('projects.statusSaved')
            : t('projects.statusDraft');

  return (
    <header className="border-b border-editorial-border bg-[linear-gradient(180deg,#fffdf8_0%,#f8f3ea_100%)] px-6 py-5 md:px-10">
      <div className="flex flex-col gap-5">

        {/* ── Riga 1: logo + azioni ── */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="brand font-display text-4xl italic tracking-tight text-editorial-ink">
                {t('app.title')}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('app.subtitle')}
              </div>
            </div>
            {currentProject && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowProjectPanel(true)}
                  title={projectsLabel}
                  aria-label={`${projectsLabel}: ${currentProject.name}`}
                  className="rounded-full border border-editorial-border bg-editorial-bg/70 px-3 py-1.5 text-[10px] font-mono text-editorial-muted transition-colors hover:border-editorial-ink hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {currentProject.name}
                </button>
                <span className="rounded-full border border-editorial-border/70 bg-editorial-textbox/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-editorial-muted">
                  {saveStatusLabel}
                </span>
              </div>
            )}
            {!currentProject && (
              <span className="rounded-full border border-editorial-border/70 bg-editorial-textbox/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-editorial-muted">
                {saveStatusLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Sandbox standalone */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'sandbox' ? 'document' : 'sandbox')}
              title={sandboxLabel}
              aria-label={sandboxLabel}
              aria-pressed={viewMode === 'sandbox'}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                viewMode === 'sandbox'
                  ? 'border-editorial-ink bg-editorial-ink text-white'
                  : 'border-editorial-border text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
              }`}
            >
              <LayoutTemplate size={13} />
              {sandboxLabel}
            </button>

            {/* Cluster Progetto */}
            <ActionCluster>
              <div className="flex flex-wrap items-center gap-1">
                <IconButton
                  onClick={() => setShowProjectPanel(true)}
                  title={projectsLabel}
                  ariaLabel={projectsLabel}
                >
                  <FolderOpen size={16} />
                </IconButton>
                <IconButton onClick={handleImport} title={importLabel} ariaLabel={importLabel}>
                  <Upload size={16} />
                </IconButton>
                {viewMode === 'document' && (
                  <IconButton
                    onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                    title={openConfigLabel}
                    ariaLabel={openConfigLabel}
                    ariaPressed={showConfigDrawer}
                    active={showConfigDrawer}
                  >
                    <SlidersHorizontal size={16} />
                  </IconButton>
                )}
                {currentProjectId && (
                  <IconButton
                    onClick={handleSave}
                    title={saveLabel}
                    ariaLabel={saveLabel}
                    disabled={isProcessing}
                  >
                    <Save size={16} />
                  </IconButton>
                )}
              </div>
            </ActionCluster>

            {/* Cluster Generale */}
            <ActionCluster>
              <div className="flex flex-wrap items-center gap-1">
                <IconButton
                  onClick={() => setShowLibraryPanel(true)}
                  title={libraryLabel}
                  ariaLabel={libraryLabel}
                >
                  <LibraryBig size={16} />
                </IconButton>
                <button
                  onClick={toggleLang}
                  title={langLabel}
                  className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={langLabel}
                >
                  <Globe size={14} />
                  {i18n.language.toUpperCase()}
                </button>
                <IconButton
                  onClick={() => setShowSettings(true)}
                  title={settingsLabel}
                  ariaLabel={settingsLabel}
                >
                  <Settings size={16} />
                </IconButton>
                <IconButton onClick={() => setShowHelp(true)} title={helpLabel} ariaLabel={helpLabel}>
                  <HelpCircle size={16} />
                </IconButton>
              </div>
            </ActionCluster>
          </div>
        </div>

        {/* ── Riga 2: riepilogo + pipeline (solo documento) ── */}
        {viewMode === 'document' && (
          <div className="flex flex-col gap-3 border-t border-editorial-border/60 pt-4 xl:flex-row xl:items-center xl:justify-between">
            <HeaderInfoBar
              sourceWords={sourceWords}
              translatedWords={translatedWords}
              completedCount={completedCount}
              chunkCount={chunks.length}
              compositeLabel={compositeLabel}
              totalTokens={totalTokens}
              estimatedCostUsd={estimatedCostUsd}
              hasChunks={chunks.length > 0}
              onExportTxt={() => handleExport('txt')}
              onExportMd={() => handleExport('bilingual')}
              exportTxtLabel={t('files.exportTxt')}
              exportMdLabel={t('files.exportBilingual')}
            />
            {onRunPipeline && onRunAuditOnly && onCancelPipeline && (
              <div className="flex flex-wrap items-center justify-end">
                <PipelineActions
                  onRunPipeline={onRunPipeline}
                  onRunAuditOnly={onRunAuditOnly}
                  onCancelPipeline={onCancelPipeline}
                  variant="compact"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
      {pendingImport && (
        <ImportPreviewDialog
          fileName={pendingImport.fileName}
          text={pendingImport.text}
          useChunking={pendingImport.useChunking}
          targetChunkCount={pendingImport.targetChunkCount}
          onUseChunkingChange={(value) =>
            setPendingImport((current) =>
              current ? { ...current, useChunking: value } : current,
            )
          }
          onTargetChunkCountChange={(value) =>
            setPendingImport((current) =>
              current ? { ...current, targetChunkCount: value } : current,
            )
          }
          onCancel={() => setPendingImport(null)}
          onConfirm={handleConfirmImport}
        />
      )}
    </header>
  );
}


function ActionCluster({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-0 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1 shadow-sm">
      {label && (
        <>
          <span className="px-2.5 text-[9px] font-bold uppercase tracking-[0.22em] text-editorial-muted/75">
            {label}
          </span>
          <span className="mx-1 h-5 w-px bg-editorial-border/70" aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  );
}

interface IconButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  ariaPressed?: boolean;
}

function IconButton({
  onClick,
  children,
  title,
  ariaLabel,
  active = false,
  disabled = false,
  ariaPressed,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      disabled={disabled}
      className={`rounded-full border border-editorial-border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-editorial-ink text-white'
          : 'text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
      }`}
    >
      {children}
    </button>
  );
}

function HeaderInfoBar({
  sourceWords,
  translatedWords,
  completedCount,
  chunkCount,
  compositeLabel,
  totalTokens,
  estimatedCostUsd,
  hasChunks,
  onExportTxt,
  onExportMd,
  exportTxtLabel,
  exportMdLabel,
}: {
  sourceWords: number;
  translatedWords: number;
  completedCount: number;
  chunkCount: number;
  compositeLabel: string | null;
  totalTokens: number;
  estimatedCostUsd: number;
  hasChunks: boolean;
  onExportTxt: () => void;
  onExportMd: () => void;
  exportTxtLabel: string;
  exportMdLabel: string;
}) {
  const { t } = useTranslation();

  const items: { key: string; label: string; value: string }[] = [
    {
      key: 'source',
      label: t('document.infoSourceWords'),
      value: sourceWords.toLocaleString(),
    },
    {
      key: 'translated',
      label: t('document.infoTranslatedWords'),
      value: translatedWords.toLocaleString(),
    },
    {
      key: 'chunks',
      label: t('document.infoChunks'),
      value: `${completedCount} / ${chunkCount}`,
    },
  ];

  if (compositeLabel) {
    items.push({
      key: 'quality',
      label: t('document.infoQuality'),
      value: compositeLabel,
    });
  }

  items.push({
    key: 'tokens',
    label: t('header.tokenCount'),
    value: totalTokens > 0 ? totalTokens.toLocaleString() : '—',
  });

  items.push({
    key: 'cost',
    label: t('header.estimatedCost'),
    value: totalTokens > 0 ? `$${estimatedCostUsd.toFixed(4)}` : '—',
  });

  return (
    <dl className="flex flex-wrap items-center gap-2 rounded-full border border-editorial-border bg-editorial-bg px-2 py-1.5 shadow-sm">
      <div className="rounded-full bg-editorial-textbox/40 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-editorial-muted/80">
        {t('header.summaryLabel')}
      </div>
      {items.map((item) => (
        <div key={item.key} className="flex items-baseline gap-1.5 rounded-full bg-editorial-textbox/28 px-3 py-1">
          <dt className="text-[9px] font-bold uppercase tracking-[0.16em] text-editorial-muted">
            {item.label}
          </dt>
          <dd className="font-display text-sm italic text-editorial-ink">{item.value}</dd>
        </div>
      ))}
      {hasChunks && (
        <>
          <span className="mx-1 h-5 w-px bg-editorial-border/70" aria-hidden="true" />
          <button
            type="button"
            onClick={onExportTxt}
            title={exportTxtLabel}
            aria-label={exportTxtLabel}
            className="rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            TXT
          </button>
          <button
            type="button"
            onClick={onExportMd}
            title={exportMdLabel}
            aria-label={exportMdLabel}
            className="rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            MD
          </button>
        </>
      )}
    </dl>
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
