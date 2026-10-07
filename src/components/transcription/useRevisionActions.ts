import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import {
  clearTranscriptionHistory,
  deleteTranscriptionRevision,
  getSegmentByPosition,
  listRevisions,
  nameTranscriptionRevision,
  restoreRevision,
  unverifySegment,
  verifySegment,
  type TranscriptionDocument,
} from '../../services/transcriptionService';
import type { SegmentEditor } from './useSegmentEditor';

export interface RevisionActions {
  verifying: boolean;
  verify: () => Promise<void>;
  unverify: () => Promise<void>;
  restore: (revisionId: string) => Promise<void>;
  deleteRevision: (revisionId: string) => Promise<void>;
  nameRevision: (revisionId: string, name: string | null) => Promise<void>;
  clearHistory: () => Promise<void>;
}

function errorDescription(err: unknown) {
  return { description: err instanceof Error ? err.message : String(err) };
}

/**
 * Quello che si fa sullo storico della pagina aperta: verifica, ripristino,
 * eliminazione, nome, pulizia. Ogni azione ricorda la pagina da cui è partita
 * e non scrive il suo esito se nel frattempo se n'è aperta un'altra.
 */
export function useRevisionActions(
  editor: SegmentEditor,
  documentId: string,
  detail: TranscriptionDocument | null,
): RevisionActions {
  const { t } = useTranslation();
  const [verifying, setVerifying] = useState(false);
  const { segment, setSegment, setRevisions, pageIndex, pageIndexRef, draftRef, savedRef, save } = editor;

  const verify = async () => {
    if (!detail || !draftRef.current.trim()) return;
    const verifyingPage = pageIndex;
    setVerifying(true);
    try {
      const text = draftRef.current;
      if (text !== savedRef.current) await save(text);
      if (pageIndexRef.current !== verifyingPage) return;
      if (savedRef.current !== text) throw new Error(t('transcription.saveError'));
      const target = await getSegmentByPosition(documentId, verifyingPage);
      if (!target) throw new Error(t('transcription.noRevisions'));
      const revision = await verifySegment(target.id, detail.workspace_id);
      if (pageIndexRef.current === verifyingPage) setSegment({ ...target, approved_revision_id: revision.id });
      toast.success(t('transcription.verified'));
    } catch (err: unknown) {
      toast.error(t('transcription.verifyFailed'), errorDescription(err));
    } finally {
      setVerifying(false);
    }
  };

  const unverify = async () => {
    if (!segment || !detail) return;
    const verifyingPage = pageIndex;
    setVerifying(true);
    try {
      await unverifySegment(segment.id, detail.workspace_id);
      if (pageIndexRef.current === verifyingPage) setSegment({ ...segment, approved_revision_id: null });
    } catch (err: unknown) {
      toast.error(t('transcription.verifyFailed'), errorDescription(err));
    } finally {
      setVerifying(false);
    }
  };

  const restore = async (revisionId: string) => {
    if (!segment) return;
    const restoringPage = pageIndex;
    try {
      const unsavedText = draftRef.current;
      if (unsavedText !== savedRef.current) await save(unsavedText);
      if (pageIndexRef.current !== restoringPage) return;
      if (savedRef.current !== unsavedText) throw new Error(t('transcription.saveError'));
      const revision = await restoreRevision(segment.id, revisionId);
      if (pageIndexRef.current !== restoringPage) return;
      editor.replaceSavedText(revision.text);
      setRevisions((current) => [revision, ...current.filter((r) => r.id !== revision.id)]);
      toast.success(t('transcription.restored'));
    } catch (err: unknown) {
      toast.error(t('transcription.restoreFailed'), errorDescription(err));
    }
  };

  const deleteRevision = async (revisionId: string) => {
    if (!segment) return;
    const deletingPage = pageIndex;
    const segmentId = segment.id;
    const ok = await confirm({
      title: t('transcription.deleteRevisionTitle'),
      message: t('transcription.deleteRevisionMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTranscriptionRevision(segmentId, revisionId);
      if (pageIndexRef.current === deletingPage) {
        setRevisions((current) => current.filter((revision) => revision.id !== revisionId));
      }
    } catch (err: unknown) {
      toast.error(t('transcription.deleteRevisionFailed'), errorDescription(err));
    }
  };

  const nameRevision = async (revisionId: string, name: string | null) => {
    if (!segment) return;
    const namingPage = pageIndex;
    try {
      await nameTranscriptionRevision(segment.id, revisionId, name);
      if (pageIndexRef.current === namingPage) {
        setRevisions((current) => current.map((revision) =>
          revision.id === revisionId ? { ...revision, consolidated_name: name } : revision));
      }
    } catch (err: unknown) {
      toast.error(t('transcription.nameRevisionFailed'), errorDescription(err));
    }
  };

  const clearHistory = async () => {
    if (!segment) return;
    const clearingPage = pageIndex;
    const segmentId = segment.id;
    const ok = await confirm({
      title: t('transcription.clearHistoryTitle'),
      message: t('transcription.clearHistoryMessage'),
      confirmLabel: t('transcription.clearHistory'),
      danger: true,
    });
    if (!ok || pageIndexRef.current !== clearingPage) return;
    try {
      const text = draftRef.current;
      if (text !== savedRef.current) await save(text);
      if (pageIndexRef.current !== clearingPage) return;
      if (savedRef.current !== text) throw new Error(t('transcription.saveError'));
      await clearTranscriptionHistory(segmentId);
      const remaining = await listRevisions(segmentId);
      if (pageIndexRef.current === clearingPage) setRevisions(remaining);
    } catch (err: unknown) {
      toast.error(t('transcription.clearHistoryFailed'), errorDescription(err));
    }
  };

  return { verifying, verify, unverify, restore, deleteRevision, nameRevision, clearHistory };
}
