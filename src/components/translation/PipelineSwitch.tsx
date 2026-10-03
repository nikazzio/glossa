import { ArrowLeftRight, Plus, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { useConfigStore } from '../../stores/configStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { ClickPopover, IconButton, MenuActionRow, PopoverItem, RenameField, Tooltip } from '../ui';

/**
 * La pipeline aperta, nella riga in cima allo Studio: il nome (un clic lo
 * rinomina), il comando che ne sceglie un'altra, ne crea una o ne elimina una,
 * e le sue opzioni. Un progetto può avere più pipeline, e quella aperta decide
 * cosa succede premendo «traduci».
 */
export function PipelineSwitch() {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const pipelines = useProjectStore((s) => s.pipelines);
  const switchPipeline = useProjectStore((s) => s.switchPipeline);
  const createNewPipeline = useProjectStore((s) => s.createNewPipeline);
  const deletePipeline = useProjectStore((s) => s.deletePipeline);
  const renamePipeline = useProjectStore((s) => s.renamePipeline);
  const hasProject = useProjectStore((s) => !!s.currentProjectId);
  const maxPipelines = useConfigStore((s) => s.maxPipelines);
  const isRunning = usePipelineStore((s) => s.runStatus === 'running');
  const setShowConfigDrawer = useUiStore((s) => s.setShowConfigDrawer);

  const activeName =
    pipelines.find((p) => p.id === activePipelineId)?.name ??
    t('pipeline.pipelineNumber', { number: 1 });

  const handleDeletePipeline = useCallback(async (pipelineId: string, pipelineName: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmDeleteTitle'),
      message: t('pipeline.confirmDeleteMessage', { name: pipelineName }),
      confirmLabel: t('pipeline.deletePipeline'),
      danger: true,
    });
    if (!ok) return;
    await deletePipeline(pipelineId);
  }, [deletePipeline, t]);

  const saveName = (name: string) => {
    setEditing(false);
    if (!activePipelineId) return;
    void renamePipeline(activePipelineId, name).catch((err: unknown) => {
      toast.error(t('pipeline.renameFailed'), { description: err instanceof Error ? err.message : String(err) });
    });
  };

  return (
    <span className="flex min-w-0 items-center gap-1">
      {editing ? (
        <RenameField
          initial={activeName}
          label={t('pipeline.pipelineNameLabel')}
          onSave={saveName}
          onCancel={() => setEditing(false)}
          className="w-48"
        />
      ) : (
        <Tooltip label={t('pipeline.renamePipeline')} side="bottom">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={!activePipelineId || isRunning}
            className="min-w-0 truncate text-sm text-editorial-ink transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed"
          >
            {activeName}
          </button>
        </Tooltip>
      )}
      {pipelines.length > 0 && (
        <ClickPopover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          side="bottom"
          align="start"
          trigger={
            <IconButton
              size="sm"
              tone={popoverOpen ? 'accent' : 'default'}
              title={t('pipeline.changePipeline')}
              ariaPressed={popoverOpen}
              tooltipSide="bottom"
              className="shrink-0"
            >
              <ArrowLeftRight size={12} />
            </IconButton>
          }
        >
          {pipelines.map((pipeline) => {
            const isActive = pipeline.id === activePipelineId;
            const canDelete = pipelines.length > 1 && !(isActive && isRunning);
            return (
              <div key={pipeline.id} className="flex items-center gap-1 pl-2 pr-1">
                {/* La pipeline aperta porta il pallino della scelta. */}
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-editorial-accent' : 'bg-editorial-border'}`}
                />
                <PopoverItem
                  label={pipeline.name}
                  onSelect={() => {
                    void switchPipeline(pipeline.id);
                    setPopoverOpen(false);
                  }}
                />
                {canDelete && (
                  <IconButton
                    size="sm"
                    tone="muted"
                    onClick={() => void handleDeletePipeline(pipeline.id, pipeline.name)}
                    title={t('pipeline.deletePipeline')}
                    className="shrink-0"
                  >
                    <Trash2 size={12} />
                  </IconButton>
                )}
              </div>
            );
          })}
          {hasProject && pipelines.length < maxPipelines && (
            <div className="mt-1 border-t border-rule pt-1">
              <MenuActionRow
                icon={<Plus size={12} />}
                label={t('pipeline.newPipeline')}
                onClick={() => {
                  void createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }));
                  setPopoverOpen(false);
                }}
              />
            </div>
          )}
        </ClickPopover>
      )}
      <IconButton
        size="sm"
        onClick={() => setShowConfigDrawer(true)}
        title={t('pipeline.configurePipeline')}
        tooltipSide="bottom"
        className="shrink-0"
      >
        <Settings2 size={13} />
      </IconButton>
    </span>
  );
}
