import { useState } from 'react';
import { X, LibraryBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../common';
import { PipelineConfig } from '../pipeline/PipelineConfig';
import type { ConfigSection } from '../pipeline/PipelineConfig';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { DictionaryEntryEditor } from '../library';

interface ConfigDrawerProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
}

const TABS: { id: ConfigSection; labelKey: string }[] = [
  { id: 'stages',  labelKey: 'pipeline.tabStages'  },
  { id: 'audit',   labelKey: 'pipeline.tabAudit'   },
  { id: 'glossary', labelKey: 'pipeline.tabGlossary' },
];

export function ConfigDrawer({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
}: ConfigDrawerProps) {
  const { t } = useTranslation();
  const showConfigDrawer = useUiStore((state) => state.showConfigDrawer);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);
  const [activeTab, setActiveTab] = useState<ConfigSection>('stages');
  const { config, setConfig } = usePipelineStore();
  const { glossaries, setShowLibraryPanel } = useLibraryStore();

  const assignedGlossary = glossaries.find((g) => g.id === config.assignedGlossaryId);

  return (
    <Drawer
      open={showConfigDrawer}
      side="left"
      onClose={() => setShowConfigDrawer(false)}
      ariaLabelledBy="config-drawer-title"
      ariaDescribedBy="config-drawer-hint"
      maxWidth="max-w-[680px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-editorial-border px-6 pt-4 pb-0">
        <div className="min-w-0 pb-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.configDrawerTitle')}
          </div>
          <h2
            id="config-drawer-title"
            className="mt-1 font-display text-2xl italic tracking-tight text-editorial-ink"
          >
            {t('pipeline.globalSetup')}
          </h2>
          <p
            id="config-drawer-hint"
            className="mt-1 text-xs leading-relaxed text-editorial-muted"
          >
            {t('document.configDrawerHint')}
          </p>

          {/* Tab bar */}
          <div className="mt-4 flex gap-0" role="tablist" aria-label={t('document.configDrawerTitle')}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                id={`config-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="config-tabpanel"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent border-b-2 ${
                  activeTab === tab.id
                    ? 'border-editorial-ink text-editorial-ink'
                    : 'border-transparent text-editorial-muted hover:text-editorial-ink'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowConfigDrawer(false)}
          className="shrink-0 mt-1 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('header.closeDrawer')}
        >
          <X size={16} />
        </button>
      </div>

      <div
        id="config-tabpanel"
        role="tabpanel"
        aria-labelledby={`config-tab-${activeTab}`}
        className="flex flex-1 flex-col min-h-0"
      >
        {activeTab === 'glossary' ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto bg-editorial-bg/40 p-6 custom-scrollbar">
            {/* Dizionario assegnato */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-editorial-border/40 bg-editorial-textbox/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted mb-0.5">
                  {t('library.assignedDictionary')}
                </p>
                <p className="text-[12px] font-mono text-editorial-ink truncate">
                  {assignedGlossary ? assignedGlossary.name : t('library.noDictionaryAssigned')}
                </p>
              </div>
              <button
                onClick={() => setShowLibraryPanel(true, 'dictionaries')}
                title={t('library.openLibrary')}
                className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                <LibraryBig size={14} />
                {t('library.openLibrary')}
              </button>
            </div>

            <DictionaryEntryEditor
              entries={config.glossary}
              onChange={(entries) => setConfig((prev) => ({ ...prev, glossary: entries }))}
            />
          </div>
        ) : (
          <PipelineConfig
            onRunPipeline={onRunPipeline}
            onRunAuditOnly={onRunAuditOnly}
            onCancelPipeline={onCancelPipeline}
            showActions={false}
            visibleSection={activeTab}
            className="flex flex-1 flex-col gap-8 overflow-y-auto bg-editorial-bg/40 p-6 custom-scrollbar"
          />
        )}
      </div>
    </Drawer>
  );
}
