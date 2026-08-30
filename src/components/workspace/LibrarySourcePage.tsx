import { ArrowLeft, BookOpenText, Images, Info, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, SectionLabel, StatRow } from '../ui';
import { SourceSizeCap } from './SourceSizeCap';
import { SourceActionBar } from './SourceActionBar';
import { useSourceActions } from './useSourceActions';
import { summarizeAvailability } from '../../services/vaultService';
import { humanSize } from '../../utils';
import type { LibraryCatalogEntry, LibrarySourceDetail, Workspace } from '../../types';

interface LibrarySourcePageProps {
  detail: LibrarySourceDetail;
  /** La riga di catalogo della stessa opera: porta disponibilità e comandi.
   *  Manca solo finché il catalogo non è stato letto. */
  entry?: LibraryCatalogEntry;
  workspaces: Workspace[];
  onBack: () => void;
  onRemoved: () => void;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
  onToggleLink: (workspaceId: string, linked: boolean) => void;
}

/** La scheda di un'opera: cosa è, quanto ne hai, cosa puoi farci, dove sta. */
export function LibrarySourcePage({
  detail,
  entry,
  workspaces,
  onBack,
  onRemoved,
  onSetArchived,
  onRefresh,
  onToggleLink,
}: LibrarySourcePageProps) {
  const { t } = useTranslation();

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
      <div className="flex flex-col gap-6 px-5 py-5 md:px-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <IconButton size="sm" onClick={onBack} title={t('areas.library.backToCatalogue')}>
              <ArrowLeft size={13} />
            </IconButton>
            <div className="min-w-0">
              <h1 className="font-display text-3xl italic text-editorial-ink md:text-4xl">
                {detail.source.title}
              </h1>
              {entry && (entry.creator || entry.date) && (
                <p className="mt-1 text-sm text-editorial-muted">
                  {[entry.creator, entry.date].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {entry && (
            <SourceActionsForEntry
              entry={entry}
              onRemoved={onRemoved}
              onSetArchived={onSetArchived}
              onRefresh={onRefresh}
            />
          )}
        </header>

        <section className="space-y-2">
          <SectionLabel icon={Info} label={t('areas.library.detailsSection')} />
          <dl className="space-y-1.5">
            <StatRow
              label={t('areas.library.kind')}
              value={t(`areas.library.kindLabels.${detail.source.kind}`)}
            />
            {detail.source.primaryLanguage && (
              <StatRow
                label={t('areas.library.languageField')}
                value={detail.source.primaryLanguage}
              />
            )}
            {detail.source.externalRef && (
              <StatRow
                label={t('areas.library.provenanceField')}
                value={detail.source.externalRef}
              />
            )}
            {entry && (
              <>
                <StatRow
                  label={t('areas.library.availabilityField')}
                  value={availabilityText(entry, t)}
                />
                {entry.localBytes > 0 && (
                  <StatRow
                    label={t('areas.library.occupiedField')}
                    value={humanSize(entry.localBytes)}
                  />
                )}
              </>
            )}
            <StatRow
              label={t('areas.library.statusField')}
              value={
                detail.source.status === 'archived'
                  ? t('areas.library.statusArchived')
                  : t('areas.library.statusActive')
              }
            />
          </dl>
        </section>

        <section className="space-y-2">
          <SectionLabel icon={BookOpenText} label={t('areas.library.copiesSection')} />
          <ul className="space-y-2">
            {detail.versions.map((version) => (
              <li
                key={version.id}
                className="space-y-2 rounded-md border border-editorial-border bg-surface-elevated px-3 py-2"
              >
                <p className="truncate font-mono text-xs text-editorial-muted">
                  {version.sourceUrl}
                </p>
                <SourceSizeCap versionId={version.id} />
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <SectionLabel icon={Link2} label={t('areas.library.linkedWorkspaces')} />
          <ul className="space-y-1">
            {workspaces.map((workspace) => {
              const linked = detail.linkedWorkspaceIds.includes(workspace.id);
              return (
                <li
                  key={workspace.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-editorial-border bg-surface-elevated px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-editorial-ink">
                    {workspace.name}
                  </span>
                  <IconButton
                    title={
                      linked
                        ? t('areas.library.unlinkWorkspace', { name: workspace.name })
                        : t('areas.library.linkWorkspace', { name: workspace.name })
                    }
                    onClick={() => onToggleLink(workspace.id, !linked)}
                    tone={linked ? 'accent' : 'default'}
                    ariaPressed={linked}
                    size="sm"
                  >
                    <Link2 size={14} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Il visore delle pagine nasce come lavoro a sé e verrà riusato anche
            dallo Studio di trascrizione: qui resta il posto dove andrà. */}
        <section className="space-y-2">
          <SectionLabel icon={Images} label={t('areas.library.viewerSection')} />
          <div className="flex min-h-[9rem] items-center justify-center rounded-md border border-dashed border-editorial-border px-4 py-6 text-center text-xs text-editorial-muted">
            {t('areas.library.viewerComingSoon')}
          </div>
        </section>
      </div>
    </main>
  );
}

/** I comandi vivono in un componente a parte perché il loro stato è un hook,
 *  e la scheda deve poterli mostrare solo quando la riga di catalogo c'è. */
function SourceActionsForEntry({
  entry,
  onRemoved,
  onSetArchived,
  onRefresh,
}: {
  entry: LibraryCatalogEntry;
  onRemoved: () => void;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
}) {
  const actions = useSourceActions(entry, {
    onRemove: onRemoved,
    onSetArchived,
    onRefresh,
  });
  return <SourceActionBar entry={entry} actions={actions} size="md" />;
}

/** Stessa lettura della riga di catalogo: la disponibilità la dice il deposito. */
function availabilityText(
  entry: LibraryCatalogEntry,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const principal = entry.sizes.find((size) => size.sizeTag === entry.principalSize);
  const summary = summarizeAvailability(
    entry.localPages,
    entry.expectedPages ?? 0,
    principal?.missing ?? 0,
  );
  if (summary.availability === 'catalogued') return t('areas.library.availabilityRemote');
  if (summary.availability === 'complete') return t('areas.library.availabilityComplete');
  return t('areas.library.availabilityPartial', {
    done: summary.presentPages,
    total: summary.expectedPages,
  });
}
