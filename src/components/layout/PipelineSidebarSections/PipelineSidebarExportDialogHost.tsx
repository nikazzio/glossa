import { lazy, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useChunksStore } from '../../../stores/chunksStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { useAnnotationsStore } from '../../../stores/annotationsStore';
import { exportTranslation, exportBilingual } from '../../../services/fileService';
import type { ExportFormat } from '../../document/ExportDialog';

const ExportDialog = lazy(() =>
  import('../../document/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);

export function PipelineSidebarExportDialogHost({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const chunks = useChunksStore((state) => state.chunks);
  const markdownAware = usePipelineStore((state) => state.config.markdownAware === true);

  const handleExport = useCallback(async (
    format: ExportFormat,
    separator: string,
    useMarkdownAware: boolean,
  ) => {
    onOpenChange(false);
    try {
      const annotations = useAnnotationsStore.getState().annotationsByChunkId;
      const ok =
        format === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, format, {
              markdownAware: useMarkdownAware,
              separator,
              annotations,
            });
      if (ok) toast.success(t('files.exported'));
    } catch (err: unknown) {
      toast.error(t('files.exportError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [chunks, onOpenChange, t]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <ExportDialog
        chunks={chunks}
        markdownAware={markdownAware}
        onConfirm={handleExport}
        onCancel={() => onOpenChange(false)}
      />
    </Suspense>
  );
}
