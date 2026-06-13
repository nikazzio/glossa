import { motion } from 'motion/react';
import { DashboardSidebar } from './DashboardSidebar';
import {
  PipelineSidebarDocumentSection,
  PipelineSidebarPipelinesSection,
  PipelineSidebarRunSection,
  PipelineSidebarWorkspaceSection,
} from './PipelineSidebarSections';

interface PipelineSidebarProps {
  mode?: 'dashboard' | 'editor';
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
  onOpenWorkspaceSettings?: () => void;
}

export function PipelineSidebar({
  mode = 'editor',
  onRunPipeline,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
  onImportDocument,
  onOpenWorkspaceSettings,
}: PipelineSidebarProps) {
  if (mode === 'dashboard') {
    return <DashboardSidebar />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -22 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="relative isolate flex w-52 shrink-0 flex-col bg-editorial-bg/60 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-0 after:w-px after:bg-editorial-border after:content-['']"
    >
      <PipelineSidebarWorkspaceSection
        onImportDocument={onImportDocument}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
      />

      <div className="mx-3 my-4 h-px bg-editorial-border/60" />

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 scrollbar-hidden">
        <PipelineSidebarRunSection
          onRunPipeline={onRunPipeline}
          onCancelPipeline={onCancelPipeline}
          onDryRun={onDryRun}
          onRetranslateChunk={onRetranslateChunk}
        />

        <div className="my-4 h-px bg-editorial-border/60" />

        <PipelineSidebarPipelinesSection />
      </div>

      <PipelineSidebarDocumentSection />
    </motion.div>
  );
}
