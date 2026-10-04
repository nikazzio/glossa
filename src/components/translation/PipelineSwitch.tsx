import { ChevronDown, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { useConfigStore } from '../../stores/configStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { ClickPopover, IconButton, MenuActionRow, PopoverItem, RenameField, Tooltip } from '../ui';

/**
 * La pipeline aperta, nella riga in cima allo Studio: il nome apre il menu
 * che ne sceglie un'altra, la rinomina, ne crea una o ne elimina una; accanto
 * le sue opzioni. Un progetto può avere più pipeline, e quella aperta decide
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
  const isRunning = useChunksStore((s) => s.isProcessing);
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
  const reportError = (err: unknown) => toast.error(t('pipeline.operationFailed'), {
    description: err instanceof Error ? err.message : String(err),
  });

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
        // Il nome è l'unico ingresso al menu: scegliere, rinominare, creare, eliminare.
        <Tooltip
          label={`${activeName} — ${isRunning ? `${t('pipeline.changePipeline')} — ${t('document.reasonRunning')}` : t('pipeline.changePipeline')}`}
          side="bottom"
          className="min-w-0"
          // A menu aperto il suggerimento resta chiuso: starebbe sopra le voci.
          open={popoverOpen ? false : undefined}
        >
          <ClickPopover
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            side="bottom"
            align="start"
            trigger={
              <button
                type="button"
                disabled={!activePipelineId || isRunning || pipelines.length === 0}
                className="flex min-w-0 items-center gap-1 font-display text-base italic text-editorial-ink transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed"
              >
                <span className="max-w-[min(18vw,14rem)] truncate">{activeName}</span>
                <ChevronDown size={12} aria-hidden="true" className="shrink-0 text-editorial-muted" />
              </button>
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
                    disabled={isRunning}
                    onSelect={() => {
                      void switchPipeline(pipeline.id).catch(reportError);
                      setPopoverOpen(false);
                    }}
                  />
                  {canDelete && (
                    <IconButton
                      size="sm"
                      tone="muted"
                      onClick={() => void handleDeletePipeline(pipeline.id, pipeline.name).catch(reportError)}
                      title={t('pipeline.deletePipeline')}
                      className="shrink-0"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </div>
              );
            })}
            {/* Comandi sulla pipeline: un solo gruppo, sotto un solo filetto. */}
            {!isRunning && (activePipelineId || (hasProject && pipelines.length < maxPipelines)) && (
              <div className="mt-1 border-t border-rule pt-1">
                {activePipelineId && <MenuActionRow icon={<Pencil size={12} />} label={t('pipeline.renamePipeline')}
                  onClick={() => { setPopoverOpen(false); setEditing(true); }} />}
                {hasProject && pipelines.length < maxPipelines && (
                  <MenuActionRow
                    icon={<Plus size={12} />}
                    label={t('pipeline.newPipeline')}
                    onClick={() => {
                      void createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 })).catch(reportError);
                      setPopoverOpen(false);
                    }}
                  />
                )}
              </div>
            )}
          </ClickPopover>
        </Tooltip>
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
