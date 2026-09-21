import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FilePen, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { transcriptionsLocation } from '../../navigation/appLocation';
import {
  listDocuments,
  setDocumentStatus,
  type TranscriptionDocument,
} from '../../services/transcriptionService';
import { EmptyState, IconButton, Spinner } from '../ui';
import { CreateTranscriptionDialog } from '../transcription/CreateTranscriptionDialog';
import { TranscriptionStudio } from '../transcription/TranscriptionStudio';

interface TranscriptionsCatalogAreaProps {
  documentId?: string;
}

/**
 * Area globale Trascrizioni (#210 Passo B): catalogo di tutti i documenti di
 * trascrizione di TUTTI i workspace, e — con `documentId` — lo Studio (#388)
 * concentrato su uno di essi.
 */
export function TranscriptionsCatalogArea({ documentId }: TranscriptionsCatalogAreaProps) {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [documents, setDocuments] = useState<TranscriptionDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const perWorkspace = await Promise.all(workspaces.map((w) => listDocuments(w.id)));
      setDocuments(perWorkspace.flat());
    } catch (err: unknown) {
      toast.error(t('transcription.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaces, t]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const sorted = useMemo(
    () => [...documents].sort((a, b) => a.title.localeCompare(b.title)),
    [documents],
  );

  const openDocument = (id: string) => navigate(transcriptionsLocation({ documentId: id }));

  const handleDelete = async (document: TranscriptionDocument) => {
    const ok = await confirm({
      title: t('transcription.confirmDeleteTitle'),
      message: t('transcription.confirmDeleteMessage', { name: document.title }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await setDocumentStatus(document.id, 'trashed');
      await loadAll();
      toast.success(t('transcription.deleted'));
    } catch (err: unknown) {
      toast.error(t('transcription.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (documentId) {
    const document = documents.find((d) => d.id === documentId);
    return (
      <TranscriptionStudio
        key={documentId}
        documentId={documentId}
        workspaceId={document?.workspace_id ?? null}
        onBack={() => navigate(transcriptionsLocation())}
      />
    );
  }

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
            {t('areas.transcriptions.title')}
          </h1>
        </div>

        {isLoading ? (
          <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 px-1 py-2 text-xs text-editorial-muted" />
        ) : sorted.length === 0 ? (
          <>
            <EmptyState
              icon={<FilePen size={28} />}
              message={t('areas.transcriptions.emptyMessage')}
              hint={t('areas.transcriptions.emptyHint')}
            />
            <div className="mt-4">
              <NewDocumentCard onClick={() => setShowNewDialog(true)} />
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {sorted.map((document) => {
              const workspace = workspaces.find((w) => w.id === document.workspace_id);
              return (
                <motion.article
                  key={document.id}
                  layout
                  initial={false}
                  className="group relative overflow-hidden rounded-[26px] border border-editorial-border bg-editorial-paper/75 px-4 py-3.5 shadow-[var(--inset-highlight)] transition-colors duration-150 hover:border-editorial-accent/45 hover:bg-editorial-paper"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openDocument(document.id)}
                      className="min-w-0 flex-1 pr-10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FilePen size={13} className="shrink-0 text-editorial-muted" aria-hidden="true" />
                        <span className="truncate font-display text-xl italic text-editorial-ink">
                          {document.title}
                        </span>
                      </span>
                      {workspace && (
                        <span className="mt-1 block truncate text-xs text-editorial-muted">
                          {workspace.name}
                        </span>
                      )}
                    </button>
                    <IconButton
                      size="sm"
                      tone="muted"
                      onClick={() => void handleDelete(document)}
                      title={`${t('transcription.delete')} ${document.title}`}
                      ariaLabel={`${t('transcription.delete')} ${document.title}`}
                      className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                </motion.article>
              );
            })}
            <NewDocumentCard onClick={() => setShowNewDialog(true)} />
          </div>
        )}
      </div>

      <CreateTranscriptionDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={(id) => {
          void loadAll();
          openDocument(id);
        }}
      />
    </main>
  );
}

function NewDocumentCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.button
      type="button"
      layout
      onClick={onClick}
      className="group flex min-h-[100px] w-full items-center justify-center gap-3 rounded-[26px] border border-dashed border-editorial-border bg-transparent transition-colors hover:border-editorial-accent/45 hover:bg-editorial-paper/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      aria-label={t('transcription.newDocumentCard')}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-editorial-border text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
        <Plus size={16} />
      </span>
      <span className="font-display text-lg italic text-editorial-muted transition-colors group-hover:text-editorial-ink">
        {t('transcription.newDocumentCard')}
      </span>
    </motion.button>
  );
}
