import { useState, type ReactNode } from 'react';
import { BookOpen, Brain, Eraser, Eye, Languages, Settings, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogCancelButton, IconButton, TabStrip, type TabStripItem } from '../ui';
import { PipelineConfig, type ConfigSection } from '../pipeline/PipelineConfig';
import { useUiStore } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useProjectStore } from '../../stores/projectStore';
import { confirm } from '../../stores/confirmStore';

const TAB_ID_PREFIX = 'pconfig';

/** La finestra di configurazione della pipeline aperta: titolo con il suo
 *  nome (si rinomina dalla riga in cima allo Studio), linguette nella fila
 *  della finestra, azzeramento delle traduzioni in fondo. */
export function ConfigDrawer() {
  const { t } = useTranslation();
  const showConfigDrawer = useUiStore((state) => state.showConfigDrawer);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);
  const setWorkMode = useConfigStore((state) => state.setWorkMode);
  const mode = usePipelineStore((s) => s.config.mode);
  const { chunks, resetAllChunks, isProcessing } = useChunksStore();
  const { pipelines, activePipelineId } = useProjectStore();
  const activePipeline = pipelines.find((p) => p.id === activePipelineId);
  const [activeTab, setActiveTab] = useState<ConfigSection>('translation');

  const completedCount = chunks.filter((c) => c.status === 'completed').length;

  const handleResetAll = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmResetAllTitle'),
      message: t('pipeline.confirmResetAllMessage', { count: completedCount }),
      confirmLabel: t('pipeline.resetAll'),
      danger: true,
    });
    if (!ok) return;
    resetAllChunks();
    setWorkMode('chunk');
    toast.success(t('pipeline.resetAllDone'));
  };

  const memoryDisabled = mode === 'deepl-hybrid';
  // La linguetta Memoria si spegne passando a DeepL: chi la stava guardando
  // torna a Generale invece di restare davanti a una scheda vuota.
  const shownTab: ConfigSection = activeTab === 'memory' && memoryDisabled ? 'settings' : activeTab;

  const tabEntries: Array<{ id: ConfigSection; label: string; icon: ReactNode; disabledReason?: string }> = [
    { id: 'settings', label: t('pipeline.tabSettings'), icon: <Settings size={16} /> },
    { id: 'translation', label: t('pipeline.tabTranslation'), icon: <Languages size={16} /> },
    { id: 'audit', label: t('pipeline.tabAudit'), icon: <ShieldCheck size={16} /> },
    {
      id: 'memory',
      label: t('pipeline.tabMemory'),
      icon: <Brain size={16} />,
      disabledReason: memoryDisabled ? t('pipeline.memoryUnavailableDeepl') : undefined,
    },
    { id: 'glossary', label: t('pipeline.tabGlossary'), icon: <BookOpen size={16} /> },
    { id: 'preview', label: t('pipeline.tabPreview'), icon: <Eye size={16} /> },
  ];
  const tabs: TabStripItem[] = tabEntries.map(({ id, label, icon, disabledReason }) => ({
    id,
    label: disabledReason ? t('transcription.commandBlocked', { command: label, reason: disabledReason }) : label,
    icon,
    disabled: Boolean(disabledReason),
  }));

  const tabBar = (
    <div className="flex items-center gap-3">
      <TabStrip
        tabs={tabs}
        activeId={shownTab}
        onChange={(id) => setActiveTab(id as ConfigSection)}
        ariaLabel={t('pipeline.configSections')}
        idPrefix={TAB_ID_PREFIX}
      />
      <span className="font-display text-sm italic text-editorial-ink">
        {tabEntries.find((tab) => tab.id === shownTab)?.label}
      </span>
    </div>
  );

  const resetLabel = t('pipeline.resetAll');
  const resetBlockedReason = isProcessing
    ? t('document.operationsRunning')
    : completedCount === 0
      ? t('pipeline.resetAllNothing')
      : null;

  return (
    <Dialog
      open={showConfigDrawer}
      onOpenChange={(open) => { if (!open) setShowConfigDrawer(false); }}
      eyebrow={t('pipeline.configurePipeline')}
      title={activePipeline?.name ?? t('pipeline.configurePipeline')}
      closeLabel={t('common.close')}
      closeDisabled={isProcessing}
      widthClassName="max-w-4xl"
      panelClassName="h-[88vh]"
      bodyClassName="p-0"
      tabBar={tabBar}
      footer={
        <div className="flex items-center justify-between">
          <IconButton
            tone="danger"
            onClick={() => void handleResetAll()}
            disabled={resetBlockedReason !== null}
            title={resetBlockedReason
              ? t('transcription.commandBlocked', { command: resetLabel, reason: resetBlockedReason })
              : resetLabel}
            tooltipSide="top"
          >
            <Eraser size={16} />
          </IconButton>
          <DialogCancelButton onClick={() => setShowConfigDrawer(false)} disabled={isProcessing}>
            {t('common.close')}
          </DialogCancelButton>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-editorial-bg/40">
        <PipelineConfig activeTab={shownTab} />
      </div>
    </Dialog>
  );
}
