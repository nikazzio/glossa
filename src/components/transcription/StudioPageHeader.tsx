import { useState } from 'react';
import { BookOpenText, ExternalLink, FilePen, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, IconLink, PageHeader } from '../ui';
import { WorkIdentity } from '../common/WorkIdentity';
import { CopyProvenance } from '../workspace/CopyProvenance';
import { confirm } from '../../stores/confirmStore';
import { setDocumentStatus } from '../../services/transcriptionService';
import type { BookHeaderInfo } from './useTranscriptionSources';

interface StudioPageHeaderProps {
  documentId: string;
  documentTitle: string | null;
  bookInfo: BookHeaderInfo | null;
  onBack: () => void;
}

/**
 * Stessa riga della scheda opera in Biblioteca (icona, titolo/autore, uscita
 * verso la biblioteca): quando il documento è legato a un'opera è quella a
 * identificarlo qui, non il titolo scelto per la trascrizione — visibile
 * comunque nel breadcrumb in alto.
 */
export function StudioPageHeader({ documentId, documentTitle, bookInfo, onBack }: StudioPageHeaderProps) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);

  const removeDocument = async () => {
    const ok = await confirm({
      title: t('transcription.confirmDeleteTitle'),
      message: t('transcription.confirmDeleteMessage', { name: documentTitle ?? '' }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await setDocumentStatus(documentId, 'trashed');
      toast.success(t('transcription.deleted'));
      onBack();
    } catch (err: unknown) {
      toast.error(t('transcription.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <PageHeader
      area="transcriptions"
      icon={bookInfo ? BookOpenText : FilePen}
      onBack={onBack}
      backLabel={t('transcription.backToCatalogue')}
      title={bookInfo ? (
        <WorkIdentity variant="header" work={bookInfo.work} />
      ) : (
        <span className="block truncate font-display text-sm italic text-editorial-ink">
          {documentTitle ?? t('areas.transcriptions.title')}
        </span>
      )}
      actions={
        <>
          {bookInfo?.providerLabel && (
            <CopyProvenance
              providerLabel={bookInfo.providerLabel}
              className="mr-1 max-w-[12rem] truncate text-xs text-editorial-ink"
            />
          )}
          {bookInfo?.pageUrl && (
            <IconLink size="sm" href={bookInfo.pageUrl} title={t('areas.library.openOnLibrarySite')} tooltipSide="bottom">
              <ExternalLink size={14} />
            </IconLink>
          )}
          {/* Un solo comando: un menu per una voce sola sarebbe un clic in più. */}
          <IconButton
            size="sm"
            onClick={() => void removeDocument()}
            disabled={removing}
            title={t('transcription.removeDocument')}
            tooltipSide="bottom"
          >
            <Trash2 size={14} />
          </IconButton>
        </>
      }
    />
  );
}
