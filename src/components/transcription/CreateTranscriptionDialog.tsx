import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { FilePen, FileText, Images } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createDocument } from '../../services/transcriptionService';
import { getLibrarySourceDetail, listLibraryCatalog } from '../../services/libraryService';
import { versionInventory } from '../../services/inventoryService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Dialog, DialogCancelButton, DialogConfirmButton, FIELD_CLASSNAME, FieldLabel, LinkChip, SegmentedControl, Select } from '../ui';
import type { LibraryCatalogEntry } from '../../types';

const MAX_SOURCE_RESULTS = 8;

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
  /** Voce evidenziata da tastiera nell'elenco delle opere; -1 = nessuna. */
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const fieldId = useId();
  const titleInputId = `${fieldId}-title`;
  const sourceInputId = `${fieldId}-source`;
  const sourceListId = `${fieldId}-source-list`;
  const optionId = (index: number) => `${fieldId}-source-option-${index}`;
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
      .then(async (detail) => {
        if (cancelled) return;
        const candidates = detail.versions.filter(
          (version): version is typeof version & { versionKind: 'iiif_manifest' | 'pdf' } =>
            (version.versionKind === 'iiif_manifest' || version.versionKind === 'pdf') &&
            Boolean(version.sourceUrl),
        );
        // Il manifesto IIIF si apre in streaming, non serve averlo scaricato.
        // Il PDF invece lo apre solo il visore locale: senza un documento già
        // scaricato la scelta porterebbe subito a una pagina che non si apre.
        const pdfAvailability = await Promise.all(
          candidates
            .filter((version) => version.versionKind === 'pdf')
            .map((version) => versionInventory(version.id).then((inventory) => [version.id, Boolean(inventory?.document)] as const)),
        );
        if (cancelled) return;
        const downloadedPdfIds = new Set(pdfAvailability.filter(([, hasDocument]) => hasDocument).map(([id]) => id));
        const readable = candidates.filter(
          (version) => version.versionKind === 'iiif_manifest' || downloadedPdfIds.has(version.id),
        );
        // Con la scelta fatta dalla scheda dell'opera si parte da quella;
        // scegliendo un'opera qui invece si parte dalla sua copia primaria.
        const fallback = sourceId ? sourceVersionId : pickedSource?.versionId ?? sourceVersionId;
        const startingVersion = readable.find((version) => version.id === fallback) ?? readable[0] ?? null;
        // Al massimo due scelte: la copia di partenza più una dell'altro tipo.
        // Un'opera con due manifesti IIIF avrebbe altrimenti due voci
        // "Immagini" indistinguibili in interfaccia.
        const opposite = startingVersion
          ? readable.find((version) => version.versionKind !== startingVersion.versionKind)
          : undefined;
        const versions = [startingVersion, opposite]
          .filter((version): version is NonNullable<typeof version> => Boolean(version))
          .map((version) => ({ id: version.id, versionKind: version.versionKind }));
        setReadableVersions(versions);
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
    // Invio nel titolo e click sul pulsante possono arrivare prima che
    // `creating` disattivi il pulsante: senza questa guardia il documento
    // veniva creato due volte.
    if (creating || !title.trim() || !selectedWorkspaceId) return;
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
          .slice(0, MAX_SOURCE_RESULTS)
      : [];
  const isSourceListOpen = !sourceId && !pickedSource && sourceQuery.trim() !== '';

  const pickSource = (entry: LibraryCatalogEntry) => {
    setPickedSource(entry);
    // Subito, non solo quando arriva la lista delle copie leggibili: creando
    // prima che arrivi, il documento restava senza collegamento nonostante
    // la scelta visibile.
    setChosenVersionId(entry.versionId);
    setSourceQuery('');
    setActiveResultIndex(-1);
    if (!title.trim()) setTitle(entry.source.title);
  };

  const handleSourceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (sourceResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResultIndex((index) => (index + 1) % sourceResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResultIndex((index) => (index <= 0 ? sourceResults.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeResultIndex >= 0) {
      event.preventDefault();
      const entry = sourceResults[activeResultIndex];
      if (entry) pickSource(entry);
    }
  };

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
          <div className="space-y-1.5">
            <FieldLabel block>{t('projects.chooseWorkspace')}</FieldLabel>
            <Select
              value={selectedWorkspaceId ?? ''}
              onChange={setSelectedWorkspaceId}
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              ariaLabel={t('projects.chooseWorkspace')}
              className="w-full"
            />
          </div>
        )}
        {!sourceId && (
          <div className="space-y-1.5">
            <FieldLabel block htmlFor={pickedSource ? undefined : sourceInputId}>
              {t('transcription.linkToSource')}
            </FieldLabel>
            {pickedSource ? (
              <div className="flex">
                <LinkChip
                  label={pickedSource.source.title}
                  hint={t('transcription.unlinkSource')}
                  onClick={() => setPickedSource(null)}
                />
              </div>
            ) : (
              <div className="relative">
                <input
                  id={sourceInputId}
                  value={sourceQuery}
                  onChange={(e) => {
                    setSourceQuery(e.target.value);
                    setActiveResultIndex(-1);
                  }}
                  onKeyDown={handleSourceKeyDown}
                  placeholder={t('transcription.linkToSourcePlaceholder')}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isSourceListOpen}
                  aria-controls={sourceListId}
                  aria-activedescendant={activeResultIndex >= 0 ? optionId(activeResultIndex) : undefined}
                  className={FIELD_CLASSNAME}
                />
                {isSourceListOpen && (
                  <ul
                    id={sourceListId}
                    role="listbox"
                    aria-label={t('transcription.linkToSource')}
                    className="custom-scrollbar absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-editorial-border bg-surface-elevated py-1 shadow-warm-md"
                  >
                    {sourceResults.length === 0 ? (
                      <li role="option" aria-selected={false} aria-disabled="true" className="px-3 py-1.5 text-sm text-editorial-muted">
                        {t('transcription.noSourceFound')}
                      </li>
                    ) : (
                      sourceResults.map((entry, index) => (
                        // Il focus resta nel campo (aria-activedescendant): le voci
                        // non sono pulsanti, il mouse sceglie senza togliere il focus.
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- frecce e Invio li gestisce il campo
                        <li
                          key={entry.source.id}
                          id={optionId(index)}
                          role="option"
                          aria-selected={index === activeResultIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveResultIndex(index)}
                          onClick={() => pickSource(entry)}
                          className={`cursor-pointer truncate px-3 py-1.5 text-sm transition-colors ${
                            index === activeResultIndex
                              ? 'bg-editorial-accent/10 text-editorial-accent'
                              : 'text-editorial-ink'
                          }`}
                        >
                          {entry.source.title}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        {readableVersions.length > 1 && (
          <div className="space-y-1.5">
            <FieldLabel block>{t('transcription.chooseStartingCopy')}</FieldLabel>
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
        <div className="space-y-1.5">
          <FieldLabel block htmlFor={titleInputId}>{t('transcription.titleLabel')}</FieldLabel>
          <input
            id={titleInputId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder={t('transcription.titlePlaceholder')}
            className={FIELD_CLASSNAME}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (nuovo documento)
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}
