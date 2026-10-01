import { useEffect, useRef, useState } from 'react';
import {
  Check, FileInput, History, Pencil, Pin, PinOff, RotateCcw, ScanText, Trash2, User, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, PANEL_BODY_CLASSNAME, PanelSection } from '../ui';
import type { TranscriptionRevision, TranscriptionSegment } from '../../services/transcriptionService';
import { PagePendingOverlay } from './PagePendingOverlay';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

interface Props {
  revisions: TranscriptionRevision[];
  segment: TranscriptionSegment | null;
  draft: string;
  formatDate: (value: string) => string;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onName: (id: string, name: string | null) => void;
  onClear: () => void;
  pending: boolean;
  pendingError: string | null;
}

const AUTHOR_ICONS = { user: User, ocr: ScanText, import: FileInput } as const;

export function TranscriptionHistoryTab({ revisions, segment, draft, formatDate, onRestore, onDelete,
  onName, onClear, pending, pendingError }: Props) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setEditingId(null); }, [segment?.id]);
  useEffect(() => { if (editingId) nameInputRef.current?.focus(); }, [editingId]);
  const consolidated = revisions.filter((revision) => revision.consolidated_name);
  const ordinary = revisions.filter((revision) => !revision.consolidated_name);
  const currentId = revisions[0]?.id;
  const verifiedId = segment?.approved_revision_id ?? null;
  const deletableOrdinary = ordinary.filter((revision) => revision.id !== currentId && revision.id !== verifiedId);

  const edit = (revision: TranscriptionRevision) => {
    setEditingId(revision.id);
    setName(revision.consolidated_name ?? '');
  };
  const saveName = (revisionId: string) => {
    if (!name.trim()) return;
    onName(revisionId, name.trim());
    setEditingId(null);
  };

  const nameField = (revision: TranscriptionRevision) => (
    <div className="flex items-center gap-1">
      <input ref={nameInputRef} value={name} maxLength={120}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') saveName(revision.id);
          if (event.key === 'Escape') setEditingId(null);
        }}
        aria-label={t('transcription.versionName')}
        className={`${FIELD_CLASSNAME} min-w-0 flex-1 py-1 text-sm`} />
      <IconButton size="sm" tone="accent" onClick={() => saveName(revision.id)}
        title={name.trim() ? t('common.save') : t('transcription.versionNameRequired')}
        disabled={!name.trim()}><Check size={13} /></IconButton>
      <IconButton size="sm" onClick={() => setEditingId(null)}
        title={t('common.cancel')}><X size={13} /></IconButton>
    </div>
  );

  const row = (revision: TranscriptionRevision) => {
    const AuthorIcon = AUTHOR_ICONS[revision.created_by];
    const isCurrent = revision.id === currentId;
    const isVerified = revision.id === verifiedId;
    const textInPage = revision.text === draft;
    const isEditing = editingId === revision.id;
    const renameTitle = revision.consolidated_name ? 'transcription.renameVersion' : 'transcription.consolidateVersion';
    return (
      <li key={revision.id} className="space-y-2 py-4 first:pt-0">
        {isEditing ? nameField(revision) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm italic text-editorial-ink">
                {revision.consolidated_name
                  ?? t('transcription.versionNumber', { number: revision.revision_number })}
              </p>
              <p className="caption-label flex flex-wrap items-center gap-x-1.5">
                <AuthorIcon size={11} className="shrink-0" aria-hidden="true" />
                <span>{t(`transcription.authorLabels.${revision.created_by}`)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDate(revision.created_at)}</span>
                {isCurrent && <span className="text-editorial-accent">· {t('transcription.currentBadge')}</span>}
                {isVerified && (
                  <span className="text-editorial-success">· {t('transcription.verifiedVersionBadge')}</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton size="sm" onClick={() => onRestore(revision.id)}
                title={t(textInPage ? 'transcription.alreadyCurrent' : 'transcription.restore')}
                disabled={pending || textInPage}><RotateCcw size={13} /></IconButton>
              <IconButton size="sm" onClick={() => edit(revision)}
                title={t(editingId !== null ? 'transcription.finishRenameFirst' : renameTitle)}
                disabled={pending || editingId !== null}>
                {revision.consolidated_name ? <Pencil size={13} /> : <Pin size={13} />}
              </IconButton>
              {revision.consolidated_name && (
                <IconButton size="sm" onClick={() => onName(revision.id, null)}
                  title={t('transcription.removeConsolidation')} disabled={pending}>
                  <PinOff size={13} />
                </IconButton>
              )}
              <IconButton size="sm" onClick={() => onDelete(revision.id)}
                title={t(isCurrent || isVerified
                  ? 'transcription.cannotDeleteCurrentOrVerified'
                  : 'transcription.deleteRevision')}
                disabled={pending || isCurrent || isVerified}>
                <Trash2 size={13} />
              </IconButton>
            </div>
          </div>
        )}
        <p className="line-clamp-3 text-xs text-editorial-ink">{revision.text}</p>
      </li>
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={PANEL_BODY_CLASSNAME}>
        {consolidated.length > 0 && (
          <PanelSection icon={Pin} label={t('transcription.consolidatedVersions')}>
            <ul className="divide-y divide-rule" aria-label={t('transcription.consolidatedVersions')}>
              {consolidated.map(row)}
            </ul>
          </PanelSection>
        )}
        <PanelSection
          icon={History}
          label={t('transcription.tabs.history')}
          actions={
            <IconButton size="sm" onClick={onClear}
              title={t(deletableOrdinary.length === 0 ? 'transcription.clearHistoryNothing' : 'transcription.clearHistory')}
              disabled={pending || deletableOrdinary.length === 0}>
              <Trash2 size={13} />
            </IconButton>
          }
        >
          {ordinary.length === 0 ? (
            <p className="text-sm text-editorial-muted">
              {t(consolidated.length > 0 ? 'transcription.noOtherRevisions' : 'transcription.noRevisions')}
            </p>
          ) : (
            <ul className="divide-y divide-rule" aria-label={t('transcription.tabs.history')}>
              {ordinary.map(row)}
            </ul>
          )}
        </PanelSection>
      </div>
      <PagePendingOverlay pending={pending} errorMessage={pendingError} roundedClassName="rounded-none" />
    </div>
  );
}
