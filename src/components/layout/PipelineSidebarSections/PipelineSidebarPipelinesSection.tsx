import { ArrowLeftRight, Minus, Network, Plus, Settings2, Zap } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { confirm } from '../../../stores/confirmStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useUiStore } from '../../../stores/uiStore';
import { useConfigStore } from '../../../stores/configStore';
import { IconButton, SectionLabel, Tooltip } from '../../ui';
import { SidebarSectionShell } from './PipelineSidebarShell';

export function PipelineSidebarPipelinesSection({
  collapsed = false,
  configTrigger = 'bottom',
}: {
  collapsed?: boolean;
  // 'bottom' (shell vecchia): un solo pulsante Configura in fondo alla sezione.
  // 'circle' (shell nuova #291): ⚙ sul singolo cerchio — la config è proprietà della pipeline.
  configTrigger?: 'bottom' | 'circle';
}) {
  const { t } = useTranslation();
  const runStatus = usePipelineStore((state) => state.runStatus);
  const {
    pipelines,
    activePipelineId,
    activePipelineName,
    currentProjectId,
    switchPipeline,
    createNewPipeline,
    deletePipeline,
  } = useProjectStore(
    useShallow((state) => ({
      pipelines: state.pipelines,
      activePipelineId: state.activePipelineId,
      activePipelineName: state.pipelines.find((pipeline) => pipeline.id === state.activePipelineId)?.name ?? null,
      currentProjectId: state.currentProjectId,
      switchPipeline: state.switchPipeline,
      createNewPipeline: state.createNewPipeline,
      deletePipeline: state.deletePipeline,
    })),
  );
  const maxPipelines = useConfigStore((state) => state.maxPipelines);
  const { showConfigDrawer, setShowConfigDrawer } = useUiStore(
    useShallow((state) => ({
      showConfigDrawer: state.showConfigDrawer,
      setShowConfigDrawer: state.setShowConfigDrawer,
    })),
  );

  const hasProject = Boolean(currentProjectId);
  const isRunning = runStatus === 'running';

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

  // Gear-on-circle: configura quella pipeline. switchPipeline è async (carica la config
  // dal DB): attendiamo che sia caricata PRIMA di aprire la finestra, altrimenti la modale
  // appare con la config della pipeline precedente e poi cambia.
  const handleConfigurePipeline = useCallback(async (pipelineId: string) => {
    if (pipelineId !== activePipelineId) await switchPipeline(pipelineId);
    setShowConfigDrawer(true);
  }, [activePipelineId, switchPipeline, setShowConfigDrawer]);

  const [changePopoverOpen, setChangePopoverOpen] = useState(false);

  // In modalità 'circle' il bottone in fondo serve solo come fallback quando non c'è
  // ancora un cerchio reale su cui mostrare l'ingranaggio.
  const showBottomConfig = configTrigger === 'bottom' || pipelines.length === 0;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-1">
        <Zap size={13} className="text-editorial-muted/70" aria-hidden="true" />
        {pipelines.length === 0 ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-editorial-accent text-xs font-black text-white opacity-55">1</span>
        ) : (
          pipelines.map((pipeline, index) => {
            const isActive = pipeline.id === activePipelineId;
            const isPipelineRunning = isActive && isRunning;
            return (
              <div key={pipeline.id} className="relative">
                <IconButton
                  size="md"
                  tone={isActive ? 'accent' : 'default'}
                  onClick={() => switchPipeline(pipeline.id)}
                  title={pipeline.name}
                  tooltipSide="right"
                  className="h-9 w-9 text-sm font-black"
                >
                  {isPipelineRunning ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current" />
                  ) : (
                    index + 1
                  )}
                </IconButton>
                {pipeline.mode === 'deepl-hybrid' && (
                  <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-editorial-accent text-white pointer-events-none z-10">
                    <Network size={9} />
                  </span>
                )}
              </div>
            );
          })
        )}
        {hasProject && pipelines.length < maxPipelines ? (
          <IconButton
            size="md"
            onClick={() => createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }))}
            title={t('pipeline.newPipeline')}
            tooltipSide="right"
            className="h-9 w-9 border-dashed bg-editorial-bg"
          >
            <Plus size={14} />
          </IconButton>
        ) : null}
        <IconButton
          size="md"
          tone={showConfigDrawer ? 'accent' : 'default'}
          onClick={() => setShowConfigDrawer(!showConfigDrawer)}
          title={`${t('pipeline.configurePipeline')} (Ctrl+,)`}
          ariaLabel={t('pipeline.configurePipeline')}
          ariaPressed={showConfigDrawer}
          tooltipSide="right"
          className={`h-9 w-9 ${showConfigDrawer ? '' : 'bg-editorial-textbox'}`}
        >
          <Settings2 size={15} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="px-2.5">
      <SidebarSectionShell>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1">
            <SectionLabel icon={Zap} label={t('pipeline.sectionTitle')} />
            {activePipelineName && configTrigger !== 'circle' && (
              <span className="max-w-full truncate text-center text-xs text-editorial-muted">
                {activePipelineName}
              </span>
            )}
          </div>
          {configTrigger === 'circle' && pipelines.length > 0 ? (
            <div className="flex items-center gap-1 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-editorial-ink">
                {activePipelineName ?? t('pipeline.pipelineNumber', { number: 1 })}
              </span>
              <IconButton
                size="sm"
                tone={showConfigDrawer ? 'accent' : 'muted'}
                onClick={() => activePipelineId && void handleConfigurePipeline(activePipelineId)}
                title={`${t('pipeline.configurePipeline')} (Ctrl+,)`}
                ariaLabel={t('pipeline.configurePipeline')}
                tooltipSide="right"
                className="h-6 w-6 shrink-0 p-0"
              >
                <Settings2 size={12} />
              </IconButton>
              <Popover.Root open={changePopoverOpen} onOpenChange={setChangePopoverOpen}>
                <Popover.Trigger asChild>
                  <IconButton
                    size="sm"
                    tone={changePopoverOpen ? 'accent' : 'muted'}
                    title={t('pipeline.changePipeline')}
                    ariaLabel={t('pipeline.changePipeline')}
                    tooltipSide="right"
                    className="h-6 w-6 shrink-0 p-0"
                  >
                    <ArrowLeftRight size={11} />
                  </IconButton>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="right"
                    align="start"
                    sideOffset={8}
                    className="z-[150] flex min-w-40 flex-col gap-0.5 rounded-md border border-editorial-border bg-editorial-bg p-1 shadow-md"
                  >
                    {pipelines.map((pipeline) => (
                      <button
                        key={pipeline.id}
                        onClick={() => {
                          void switchPipeline(pipeline.id);
                          setChangePopoverOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                          pipeline.id === activePipelineId
                            ? 'bg-editorial-accent/10 font-medium text-editorial-accent'
                            : 'text-editorial-ink hover:bg-editorial-textbox/60'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pipeline.id === activePipelineId ? 'bg-editorial-accent' : 'bg-transparent'}`} />
                        <span className="truncate">{pipeline.name}</span>
                      </button>
                    ))}
                    {hasProject && pipelines.length < maxPipelines && (
                      <>
                        <div className="my-0.5 border-t border-editorial-border" />
                        <button
                          onClick={() => {
                            void createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }));
                            setChangePopoverOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-editorial-muted hover:bg-editorial-textbox/60"
                        >
                          <Plus size={11} />
                          {t('pipeline.newPipeline')}
                        </button>
                      </>
                    )}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          ) : (
            <>
              {pipelines.length === 0 ? (
                <Tooltip label={t('pipeline.pipelineNumber', { number: 1 })} side="right">
                  <div className="flex items-center justify-center">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-editorial-accent text-xs font-black text-white opacity-55">
                      1
                    </span>
                  </div>
                </Tooltip>
              ) : (
                <div className="flex flex-col items-center gap-3.5">
                  {pipelines.map((pipeline, index) => {
                    const isActive = pipeline.id === activePipelineId;
                    const isPipelineRunning = isActive && isRunning;
                    return (
                      <div key={pipeline.id} className="group relative">
                        <IconButton
                          size="lg"
                          tone={isActive ? 'accent' : 'default'}
                          onClick={() => switchPipeline(pipeline.id)}
                          title={pipeline.name}
                          tooltipSide="right"
                          className="h-14 w-14 text-base font-black"
                        >
                          {isPipelineRunning ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current" />
                          ) : (
                            index + 1
                          )}
                        </IconButton>
                        {pipeline.mode === 'deepl-hybrid' && (
                          <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-editorial-accent text-white pointer-events-none z-10">
                            <Network size={9} />
                          </span>
                        )}
                        {pipelines.length > 1 && !isPipelineRunning && (
                          <IconButton
                            size="sm"
                            tone="muted"
                            onClick={() => {
                              void handleDeletePipeline(pipeline.id, pipeline.name);
                            }}
                            title={t('pipeline.deletePipeline')}
                            ariaLabel={t('pipeline.deletePipeline')}
                            tooltipSide="right"
                            className="absolute -right-1 -top-1 z-10 h-6 w-6 bg-editorial-bg p-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                          >
                            <Minus size={13} />
                          </IconButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {hasProject && pipelines.length < maxPipelines && (
                <div className="flex items-center justify-center pt-1">
                  <IconButton
                    size="lg"
                    tone="default"
                    onClick={() => createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }))}
                    title={t('pipeline.newPipeline')}
                    tooltipSide="right"
                    className="h-11 w-11 border-dashed bg-editorial-bg"
                  >
                    <Plus size={14} />
                  </IconButton>
                </div>
              )}
            </>
          )}
          {showBottomConfig && (
            <div className="flex items-center justify-center">
              <IconButton
                size="lg"
                tone={showConfigDrawer ? 'accent' : 'default'}
                onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                title={`${t('pipeline.configurePipeline')} (Ctrl+,)`}
                ariaLabel={t('pipeline.configurePipeline')}
                tooltipSide="right"
                className={`h-11 w-11 ${showConfigDrawer ? '' : 'bg-editorial-textbox'}`}
                ariaPressed={showConfigDrawer}
              >
                <Settings2 size={15} />
              </IconButton>
            </div>
          )}
        </div>
      </SidebarSectionShell>
    </div>
  );
}
