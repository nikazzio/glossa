import { FileText, Images, Link2, Unlink2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PanelTransitionVeil } from '../common';
import { EmptyState, Spinner } from '../ui';
import { PageViewer, type PageStatus } from '../viewer/PageViewer';
import { DocumentViewer } from '../viewer/DocumentViewer';
import { ViewerCommandButton, type ViewerCommand } from '../viewer/ViewerToolbar';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { StudioSource } from './useViewerSync';

interface StudioViewerPaneProps {
  loading: boolean;
  viewerRef: ViewerVersionRef | null;
  siblingVersion: ViewerVersionRef | null;
  activeSource: StudioSource;
  /** Le due copie hanno la stessa numerazione. */
  aligned: boolean;
  manualUnlinked: boolean;
  onSourceChange: (source: StudioSource) => void;
  onToggleUnlinked: () => void;
  onPageChange: (index: number, label: string | null, total: number | null) => void;
  onPageStatusChange: (status: PageStatus | null) => void;
  jumpRequest: { index: number; token: number } | null;
  onJumpHandled: () => void;
}

function sourceLabelKey(kind: ViewerVersionRef['versionKind'], forAligned: boolean) {
  return kind === 'pdf'
    ? forAligned ? 'transcription.sourcePdf' : 'transcription.sourcePdfUnaligned'
    : forAligned ? 'transcription.sourceImages' : 'transcription.sourceImagesUnaligned';
}

/**
 * La colonna del visore: la copia scelta (immagini o PDF), o un avviso al posto
 * suo quando non c'è o non si apre — riuso di `PageViewer`/`DocumentViewer`
 * già scritti per la scheda opera in Biblioteca.
 */
export function StudioViewerPane({
  loading,
  viewerRef,
  siblingVersion,
  activeSource,
  aligned,
  manualUnlinked,
  onSourceChange,
  onToggleUnlinked,
  onPageChange,
  onPageStatusChange,
  jumpRequest,
  onJumpHandled,
}: StudioViewerPaneProps) {
  const { t } = useTranslation();
  const displayedVersion = activeSource === 'main' ? viewerRef : siblingVersion;

  // Comandi del cambio fonte: stessa barra del visore (accanto a "leggi solo
  // file locali"), non una riga a parte. Il cambio fonte compare solo con
  // una secondaria; lo sgancio manuale sempre, anche con una copia sola —
  // può tornare comodo curiosare senza spostare il punto di scrittura.
  const sourceCommands: ViewerCommand[] = viewerRef
    ? [
        ...(siblingVersion
          ? (['main', 'sibling'] as const).map((source) => {
              const version = source === 'main' ? viewerRef : siblingVersion;
              const Icon = version.versionKind === 'pdf' ? FileText : Images;
              return {
                key: source,
                icon: <Icon size={14} />,
                label: t(sourceLabelKey(version.versionKind, aligned)),
                onClick: () => onSourceChange(source),
                pressed: activeSource === source,
              };
            })
          : []),
        {
          key: 'unlink',
          icon: manualUnlinked ? <Unlink2 size={14} /> : <Link2 size={14} />,
          label: t(manualUnlinked ? 'transcription.relink' : 'transcription.unlink'),
          onClick: onToggleUnlinked,
          pressed: manualUnlinked,
        },
      ]
    : [];

  const viewerEvents = {
    onPageStatusChange,
    requestedIndex: jumpRequest?.index ?? null,
    requestToken: jumpRequest?.token ?? 0,
    onRequestedIndexHandled: onJumpHandled,
    extraControls: sourceCommands,
  };

  return (
    <>
      {loading ? (
        <Spinner size={14} label={t('common.loading')} className="flex h-full items-center justify-center gap-2 text-xs text-editorial-muted" />
      ) : displayedVersion?.versionKind === 'pdf' && displayedVersion.providerKey ? (
        <DocumentViewer
          key={displayedVersion.versionId}
          versionId={displayedVersion.versionId}
          providerKey={displayedVersion.providerKey}
          onPageChange={(index, total) => onPageChange(index, null, total)}
          {...viewerEvents}
        />
      ) : displayedVersion?.versionKind === 'iiif_manifest' && displayedVersion.sourceUrl ? (
        <PageViewer
          key={displayedVersion.versionId}
          sourceId={displayedVersion.sourceId}
          versionId={displayedVersion.versionId}
          manifestUrl={displayedVersion.sourceUrl}
          providerKey={displayedVersion.providerKey}
          onPageChange={(page) => onPageChange(page.index, page.label, page.total)}
          {...viewerEvents}
        />
      ) : (
        // I comandi del cambio fonte restano visibili anche qui — se la copia
        // scelta non si apre, si deve poter tornare indietro senza restare
        // bloccati su una schermata senza uscita.
        <div className="flex h-full min-h-0 flex-col">
          {sourceCommands.length > 0 && (
            <div className="flex h-12 shrink-0 items-center justify-end gap-1 border-b border-editorial-border px-3">
              {sourceCommands.map((command) => <ViewerCommandButton key={command.key} command={command} />)}
            </div>
          )}
          <EmptyState
            icon={<Images size={28} aria-hidden="true" />}
            message={t(displayedVersion ? 'transcription.viewerOpenFailed' : 'transcription.viewerUnavailable')}
          />
        </div>
      )}
      {/* Cambiare fonte smonta e rimonta il visore (chiavi diverse, dati
          diversi): senza questo velo si vede il vuoto per un istante fra
          i due, uno scatto invece di una transizione. */}
      <PanelTransitionVeil panelKey={displayedVersion?.versionId ?? 'none'} tone="panel" variant="project" />
    </>
  );
}
