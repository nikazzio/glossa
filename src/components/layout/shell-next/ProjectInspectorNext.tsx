import * as Tabs from '@radix-ui/react-tabs';
import { BarChart2, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { ChunkInspectorPanel, InsightDocPanel } from '../../document/InsightsDrawer';
import { IconButton } from '../../ui';

/**
 * Shell nuova (#291) — ispettore destro, gemello della barra di sinistra.
 * Un solo pannello con due schede: Approfondimenti (documento) e Frammento (chunk).
 * Sostituisce i due fly-out separati che lasciavano vuota la colonna del rail.
 * Larghezza/collasso sono gestiti dal Panel di react-resizable-panels in ShellNext;
 * qui `collapsed` arriva dal panel e mostra una barra di sole icone.
 */
export interface ProjectInspectorNextProps {
  collapsed: boolean;
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

export function ProjectInspectorNext({
  collapsed,
  onReauditChunk,
  onRunCoherenceAudit,
}: ProjectInspectorNextProps) {
  const { t } = useTranslation();
  const showChunkDrawer = useUiStore((state) => state.showChunkDrawer);
  const setActiveProjectPanel = useUiStore((state) => state.setActiveProjectPanel);

  const active: 'insight' | 'chunk' = showChunkDrawer ? 'chunk' : 'insight';
  const close = () => setActiveProjectPanel('document');

  // Collassato: barra di sole icone (apre la scheda corrispondente espandendo il panel).
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 pt-3">
        <IconButton
          size="md"
          tone={active === 'insight' ? 'accent' : 'muted'}
          onClick={() => setActiveProjectPanel('insight')}
          title={t('projectShell.insightTab')}
          tooltipSide="left"
        >
          <BarChart2 size={15} />
        </IconButton>
        <IconButton
          size="md"
          tone={active === 'chunk' ? 'accent' : 'muted'}
          onClick={() => setActiveProjectPanel('chunk')}
          title={t('projectShell.chunkTab')}
          tooltipSide="left"
        >
          <Layers size={15} />
        </IconButton>
      </div>
    );
  }

  return (
    <Tabs.Root
      value={active}
      onValueChange={(value) => setActiveProjectPanel(value as 'insight' | 'chunk')}
      className="flex h-full flex-col"
    >
      <Tabs.List
        aria-label="Rivedi"
        className="flex h-12 shrink-0 items-center border-b border-editorial-border"
      >
        <Tabs.Trigger
          value="insight"
          className="flex flex-1 items-center justify-center gap-2 h-full text-sm text-editorial-muted outline-none transition-colors hover:text-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent data-[state=active]:border-b-2 data-[state=active]:border-editorial-accent data-[state=active]:font-semibold data-[state=active]:text-editorial-accent"
        >
          <BarChart2 size={15} />
          {t('projectShell.insightTab')}
        </Tabs.Trigger>
        <Tabs.Trigger
          value="chunk"
          className="flex flex-1 items-center justify-center gap-2 h-full text-sm text-editorial-muted outline-none transition-colors hover:text-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent data-[state=active]:border-b-2 data-[state=active]:border-editorial-accent data-[state=active]:font-semibold data-[state=active]:text-editorial-accent"
        >
          <Layers size={15} />
          {t('projectShell.chunkTab')}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="insight" className="min-h-0 flex-1 overflow-hidden focus:outline-none">
        <InsightDocPanel onRunCoherenceAudit={onRunCoherenceAudit} onClose={close} />
      </Tabs.Content>
      <Tabs.Content value="chunk" className="min-h-0 flex-1 overflow-hidden focus:outline-none">
        <ChunkInspectorPanel onReauditChunk={onReauditChunk} onClose={close} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
