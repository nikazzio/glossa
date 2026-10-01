import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AREA_INK_CLASSNAME, CommandBar, CompletionBar, RenameField, Tooltip, type RowCommand } from '../ui';
import { ROW_REVEAL_CLASSNAME } from '../ui/catalogStyles';
import { CachedThumbnail } from '../common/CachedThumbnail';
import { WorkIdentity, type WorkIdentityData } from '../common/WorkIdentity';
import { DOCUMENT_TITLE_MAX } from '../../services/transcriptionService';
import type { TranscriptionCatalogEntry } from '../../services/transcriptionCatalogService';
import { progressOf, totalPagesOf } from '../../utils/transcriptionCatalogFilters';

export interface TranscriptionRowProps {
  entry: TranscriptionCatalogEntry;
  workspaceName: string;
  commands: RowCommand[][];
  renaming: boolean;
  onRename: (title: string) => void;
  onRenameCancel: () => void;
  onOpen: () => void;
}

export function workOf(entry: TranscriptionCatalogEntry): WorkIdentityData | null {
  const work = entry.work;
  if (!work) return null;
  return {
    title: work.source.title,
    creator: work.fields.creator,
    date: work.fields.date,
    place: work.fields.origin_place,
    publisher: work.fields.publisher,
  };
}

/** A che punto è: pagine scritte (sul totale, se si sa) e verificate. */
export function useProgressFacts(entry: TranscriptionCatalogEntry) {
  const { t } = useTranslation();
  const total = totalPagesOf(entry);
  const written = total
    ? t('areas.transcriptions.catalog.pagesWritten', { done: entry.pagesWithText, total })
    : t('areas.transcriptions.catalog.pagesWrittenCount', { count: entry.pagesWithText });
  const verified = entry.verifiedPages > 0
    ? t('areas.transcriptions.catalog.verifiedCount', { count: entry.verifiedPages })
    : null;
  return { total, written, verified };
}

/** Il nome della trascrizione scritto dove compare. */
export function TranscriptionRenameField(props: { initial: string; onSave: (title: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return <RenameField {...props} label={t('areas.transcriptions.catalog.renameLabel')} maxLength={DOCUMENT_TITLE_MAX} />;
}

/**
 * Una trascrizione nel suo catalogo, sul modello della riga della Biblioteca:
 * il nome in corsivo, sotto l'opera trascritta in forma compatta (autore ·
 * anno · tipografo, titolo), poi workspace e avanzamento. Quando il nome è il
 * titolo dell'opera non si ripete: la riga mostra l'opera come in Biblioteca.
 * Un click apre lo Studio; i comandi compaiono al passaggio o col fuoco.
 */
export function TranscriptionCatalogRow({ entry, workspaceName, commands, renaming, onRename, onRenameCancel, onOpen, view }:
  TranscriptionRowProps & { view: 'list' | 'grid' }) {
  const { t } = useTranslation();
  const work = workOf(entry);
  const { total, written, verified } = useProgressFacts(entry);
  const isGrid = view === 'grid';
  const archived = entry.document.status === 'archived';
  const nameIsWorkTitle = work !== null && work.title.trim() === entry.document.title.trim();
  const progress = progressOf(entry);

  const details = (
    <>
      <span className="min-w-0 truncate">{[workspaceName, written, verified].filter(Boolean).join(' · ')}</span>
      {total && entry.pagesWithText > 0 && <CompletionBar ratio={progress} label={`${Math.round(progress * 100)}%`}
        ariaLabel={t('areas.transcriptions.catalog.table.progress')} />}
    </>
  );
  const name = (
    <Tooltip label={entry.document.title} variant="panel" className="w-full min-w-0">
      <span className="block line-clamp-2 font-display text-lg italic leading-snug text-editorial-ink">
        {entry.document.title}
      </span>
    </Tooltip>
  );
  const identity = work === null ? (
    <span className="block min-w-0">
      {name}
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-editorial-muted">{details}</span>
    </span>
  ) : nameIsWorkTitle && !renaming ? (
    <WorkIdentity work={work} details={details} />
  ) : (
    <span className="block min-w-0">
      {!renaming && name}
      <WorkIdentity variant="header" work={work} details={details} />
    </span>
  );
  const cover = (
    <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-editorial-border bg-editorial-textbox">
      <CachedThumbnail
        url={entry.work?.thumbnailUrl ?? null}
        versionId={entry.work?.versionId ?? null}
        providerKey={entry.work?.providerKey ?? null}
        className="h-full w-full object-cover"
        fallback={<FileText size={18} className={AREA_INK_CLASSNAME.transcriptions} aria-hidden="true" />}
      />
    </span>
  );

  return (
    <article
      className={`group/row ${
        isGrid
          ? 'flex h-full flex-col justify-between gap-2 rounded-2xl border border-editorial-border bg-surface-elevated p-3'
          : 'flex items-start gap-3 rounded px-1 py-2.5'
      }${archived ? ' opacity-60' : ''}`}
    >
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {cover}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <TranscriptionRenameField initial={entry.document.title} onSave={onRename} onCancel={onRenameCancel} />
            {identity}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          {cover}
          <span className="min-w-0 flex-1">{identity}</span>
        </button>
      )}
      <div className={`${isGrid ? 'self-end' : ''} ${ROW_REVEAL_CLASSNAME}`}>
        <CommandBar groups={commands} variant={isGrid ? 'menu' : 'inline'} />
      </div>
    </article>
  );
}
