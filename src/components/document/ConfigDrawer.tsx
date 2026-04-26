import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../common';
import { PipelineConfig } from '../pipeline/PipelineConfig';
import { useUiStore } from '../../stores/uiStore';

interface ConfigDrawerProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
}

export function ConfigDrawer({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
}: ConfigDrawerProps) {
  const { t } = useTranslation();
  const showConfigDrawer = useUiStore((state) => state.showConfigDrawer);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);

  return (
    <Drawer
      open={showConfigDrawer}
      side="left"
      onClose={() => setShowConfigDrawer(false)}
      ariaLabelledBy="config-drawer-title"
      ariaDescribedBy="config-drawer-hint"
    >
      <div className="flex items-start justify-between gap-3 border-b border-editorial-border px-6 py-4">
        <div className="min-w-0">
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
        </div>
        <button
          type="button"
          onClick={() => setShowConfigDrawer(false)}
          className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('header.closeDrawer')}
        >
          <X size={16} />
        </button>
      </div>
      <PipelineConfig
        onRunPipeline={onRunPipeline}
        onRunAuditOnly={onRunAuditOnly}
        onCancelPipeline={onCancelPipeline}
        className="flex flex-1 flex-col gap-8 overflow-y-auto bg-editorial-bg/40 p-6 custom-scrollbar"
      />
    </Drawer>
  );
}
