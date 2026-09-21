import { useEffect, useState } from 'react';
import { BookOpenText, FilePen, FileText, Images, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createDocument } from '../../services/transcriptionService';
import { getLibrarySourceDetail, listLibraryCatalog } from '../../services/libraryService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Dialog, DialogCancelButton, DialogConfirmButton, IconButton, SegmentedControl, Select } from '../ui';
import type { LibraryCatalogEntry } from '../../types';

interface ReadableVersionOption {
  id: string;
  versionKind: 'iiif_manifest' | 'pdf';
}

interface CreateTranscriptionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Workspace già noto dal chiamante. Se assente, l'utente sceglie da un elenco. */
  workspaceId?: string;
  /** Fonte a cui ancorare il documento (una digitalizzazione della Biblioteca):
   *  quella scelta di default, o l'unica se `sourceId` non porta a più di una
   *  copia leggibile. */
  sourceVersionId?: string | null;
  /** Opera a cui appartiene `sourceVersionId`: con questa, se l'opera ha sia
   *  immagini che PDF sul computer, il dialogo lascia scegliere con quale
   *  copia iniziare — altrimenti nessuna scelta, come prima. */
  sourceId?: string;
  defaultTitle?: string;
  onCreated: (documentId: string) => void;
}

/** Dialog di creazione documento di trascrizione: crea nel workspace scelto e lo apre subito. */
export function CreateTranscriptionDialog({
  open,
  onClose,
  workspaceId,
  sourceVersionId = null,
  sourceId,
  defaultTitle = '',
  onCreated,
}: CreateTranscriptionDialogProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [title, setTitle] = useState(defaultTitle);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [creating, setCreating] = useState(false);
  /** Più di una copia leggibile per la stessa opera: solo allora si chiede
   *  quale usare. Con una sola (o nessuna, `sourceId` assente) niente scelta. */
  const [readableVersions, setReadableVersions] = useState<ReadableVersionOption[]>([]);
  const [chosenVersionId, setChosenVersionId] = useState<string | null>(sourceVersionId);
  // Il chiamante può già sapere a quale opera legare il documento (dalla
  // scheda dell'opera): solo se non lo sa si mostra la ricerca — creare un
  // documento senza passare dalla Biblioteca non offriva nessun modo di
  // collegarlo a un'opera dopo.
  const [catalog, setCatalog] = useState<LibraryCatalogEntry[]>([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [pickedSource, setPickedSource] = useState<LibraryCatalogEntry | null>(null);
  const effectiveSourceId = sourceId ?? pickedSource?.source.id;

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setSelectedWorkspaceId((current) => {
      if (workspaceId) return workspaceId;
      if (current && workspaces.some((workspace) => workspace.id === current)) return current;
      return workspaces[0]?.id ?? null;
    });
  }, [open, workspaceId, workspaces, defaultTitle]);

  useEffect(() => {
    if (!open || sourceId) return;
    setPickedSource(null);
    setSourceQuery('');
    void listLibraryCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, [open, sourceId]);

  useEffect(() => {
    if (!open || !effectiveSourceId) {
      setReadableVersions([]);
      setChosenVersionId(sourceVersionId);
      return;
    }
    let cancelled = false;
    getLibrarySourceDetail(effectiveSourceId)
      .then((detail) => {
        if (cancelled) return;
        const versions = detail.versions
          .filter(
            (version): version is typeof version & { versionKind: 'iiif_manifest' | 'pdf' } =>
              (version.versionKind === 'iiif_manifest' || version.versionKind === 'pdf') &&
              Boolean(version.sourceUrl),
          )
          .map((version) => ({ id: version.id, versionKind: version.versionKind }));
        setReadableVersions(versions);
        // Con la scelta fatta dalla scheda dell'opera si parte da quella;
        // scegliendo un'opera qui invece si parte dalla sua copia primaria.
        const fallback = sourceId ? sourceVersionId : pickedSource?.versionId ?? sourceVersionId;
        setChosenVersionId((current) =>
          current && versions.some((version) => version.id === current) ? current : fallback,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setReadableVersions([]);
          setChosenVersionId(sourceVersionId);
        }
      });
    return () => { cancelled = true; };
    // `pickedSource` non è nelle dipendenze: cambia insieme a `effectiveSourceId`
    // (deriva da lui), rileggerlo qui rifarebbe la stessa richiesta due volte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveSourceId, sourceId, sourceVersionId]);

  const close = () => {
    setTitle('');
    onClose();
  };

  const handleCreate = async () => {
    if (!title.trim() || !selectedWorkspaceId) return;
    setCreating(true);
    try {
      const document = await createDocument(selectedWorkspaceId, title.trim(), chosenVersionId);
      close();
      onCreated(document.id);
    } catch (err: unknown) {
      toast.error(t('transcription.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  };

  const sourceResults =
    !sourceId && !pickedSource && sourceQuery.trim()
      ? catalog
          .filter((entry) => entry.source.title.toLowerCase().includes(sourceQuery.trim().toLowerCase()))
          .slice(0, 8)
      : [];

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      title={t('transcription.create')}
      eyebrow={selectedWorkspace?.name ?? t('workspace.noActive')}
      closeLabel={t('common.cancel')}
      icon={<FilePen size={22} />}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-6 md:px-8"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={close}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton
            onClick={() => void handleCreate()}
            disabled={!title.trim() || !selectedWorkspaceId || creating}
          >
            {creating ? t('workspace.saving') : t('transcription.create')}
          </DialogConfirmButton>
        </div>
      }
    >
      <div className="space-y-4">
        {!workspaceId && (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
              {t('projects.chooseWorkspace')}
            </span>
            <Select
              value={selectedWorkspaceId ?? ''}
              onChange={setSelectedWorkspaceId}
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              ariaLabel={t('projects.chooseWorkspace')}
              className="w-full"
            />
          </label>
        )}
        {!sourceId && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
              {t('transcription.linkToSource')}
            </span>
            {pickedSource ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-editorial-border bg-editorial-textbox/30 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm text-editorial-ink">
                  <BookOpenText size={14} className="shrink-0 text-editorial-muted" aria-hidden="true" />
                  <span className="truncate">{pickedSource.source.title}</span>
                </span>
                <IconButton size="xs" onClick={() => setPickedSource(null)} title={t('common.cancel')}>
                  <X size={12} />
                </IconButton>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder={t('transcription.linkToSourcePlaceholder')}
                  className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-4 py-2.5 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                />
                {sourceResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-editorial-border bg-editorial-page shadow-lg custom-scrollbar">
                    {sourceResults.map((entry) => (
                      <li key={entry.source.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPickedSource(entry);
                            setSourceQuery('');
                            if (!title.trim()) setTitle(entry.source.title);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-editorial-ink hover:bg-editorial-accent/10 focus:outline-none focus-visible:bg-editorial-accent/10"
                        >
                          <BookOpenText size={13} className="shrink-0 text-editorial-muted" aria-hidden="true" />
                          <span className="truncate">{entry.source.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        {readableVersions.length > 1 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
              {t('transcription.chooseStartingCopy')}
            </span>
            <SegmentedControl
              value={chosenVersionId ?? readableVersions[0].id}
              onChange={setChosenVersionId}
              ariaLabel={t('transcription.chooseStartingCopy')}
              options={readableVersions.map((version) => ({
                value: version.id,
                label: t(version.versionKind === 'pdf' ? 'transcription.sourcePdf' : 'transcription.sourceImages'),
                icon: version.versionKind === 'pdf' ? <FileText size={14} /> : <Images size={14} />,
              }))}
            />
          </div>
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
            {t('transcription.titleLabel')}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') close();
            }}
            placeholder={t('transcription.titlePlaceholder')}
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (nuovo documento)
            autoFocus
          />
        </label>
      </div>
    </Dialog>
  );
}
