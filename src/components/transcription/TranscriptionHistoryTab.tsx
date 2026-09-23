import { useEffect, useRef, useState } from 'react';
import { Check, FileInput, Pencil, Pin, PinOff, RotateCcw, ScanText, Trash2, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';
import type { TranscriptionRevision, TranscriptionSegment } from '../../services/transcriptionService';
import { PagePendingOverlay } from './PagePendingOverlay';

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
  const deletableOrdinary = ordinary.filter((revision) =>
    revision.id !== currentId && revision.id !== segment?.approved_revision_id,
  );
  const edit = (revision: TranscriptionRevision) => {
    setEditingId(revision.id);
    setName(revision.consolidated_name ?? '');
  };
  const saveName = (revisionId: string) => {
    if (!name.trim()) return;
    onName(revisionId, name.trim());
    setEditingId(null);
  };
  const card = (revision: TranscriptionRevision) => {
    const Icon = AUTHOR_ICONS[revision.created_by];
    const approved = revision.id === segment?.approved_revision_id;
    const currentText = revision.text === draft;
    return (
      <div key={revision.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
        approved ? 'border-editorial-success/40 bg-editorial-success/5' : 'border-editorial-border'
      }`}>
        <Icon size={13} className="mt-0.5 shrink-0 text-editorial-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {editingId === revision.id ? (
            <div className="flex items-center gap-1">
              <input ref={nameInputRef} value={name} maxLength={120}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveName(revision.id);
                  if (event.key === 'Escape') setEditingId(null);
                }}
                aria-label={t('transcription.versionName')}
                className="min-w-0 flex-1 rounded border border-editorial-border bg-editorial-textbox px-2 py-1 text-xs text-editorial-ink" />
              <IconButton size="xs" onClick={() => saveName(revision.id)}
                title={t('common.save')} disabled={!name.trim()}><Check size={12} /></IconButton>
              <IconButton size="xs" onClick={() => setEditingId(null)}
                title={t('common.cancel')}><X size={12} /></IconButton>
            </div>
          ) : revision.consolidated_name ? (
            <p className="font-semibold text-editorial-ink">{revision.consolidated_name}</p>
          ) : null}
          <div className="flex items-center gap-1.5 text-editorial-muted">
            <span>{t(`transcription.authorLabels.${revision.created_by}`)}</span>
            <span>·</span><span>{formatDate(revision.created_at)}</span>
            {approved && <span className="text-editorial-success">· {t('transcription.verifiedBadge')}</span>}
          </div>
          <p className="mt-1 line-clamp-3 text-editorial-ink">{revision.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton size="xs" onClick={() => onRestore(revision.id)}
            title={t(currentText ? 'transcription.alreadyCurrent' : 'transcription.restore')}
            disabled={pending || currentText}><RotateCcw size={12} /></IconButton>
          <IconButton size="xs" onClick={() => edit(revision)}
            title={t(revision.consolidated_name ? 'transcription.renameVersion' : 'transcription.consolidateVersion')}
            disabled={pending || editingId !== null}>
            {revision.consolidated_name ? <Pencil size={12} /> : <Pin size={12} />}
          </IconButton>
          {revision.consolidated_name && (
            <IconButton size="xs" onClick={() => onName(revision.id, null)}
              title={t('transcription.removeConsolidation')} disabled={pending}>
              <PinOff size={12} />
            </IconButton>
          )}
          {revision.id !== currentId && !approved && (
            <IconButton size="xs" tone="danger" onClick={() => onDelete(revision.id)}
              title={t('transcription.deleteRevision')} disabled={pending}>
              <Trash2 size={12} />
            </IconButton>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 p-3">
      {consolidated.length > 0 && (
        <section className="space-y-2" aria-label={t('transcription.consolidatedVersions')}>
          <h3 className="px-1 text-[11px] uppercase tracking-[0.16em] text-editorial-muted">
            {t('transcription.consolidatedVersions')}
          </h3>
          {consolidated.map(card)}
        </section>
      )}
      <section className="space-y-2" aria-label={t('transcription.tabs.history')}>
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[11px] uppercase tracking-[0.16em] text-editorial-muted">
            {t('transcription.tabs.history')}
          </h3>
          <IconButton size="xs" tone="danger" onClick={onClear}
            title={t('transcription.clearHistory')} disabled={pending || deletableOrdinary.length === 0}>
            <Trash2 size={12} />
          </IconButton>
        </div>
        {ordinary.length === 0
          ? <p className="px-1 py-4 text-center text-xs text-editorial-muted">{t('transcription.noRevisions')}</p>
          : ordinary.map(card)}
      </section>
      <PagePendingOverlay pending={pending} errorMessage={pendingError} roundedClassName="rounded-none" />
    </div>
  );
}
