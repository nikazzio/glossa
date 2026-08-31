import { useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BookOpenText,
  Check,
  Eraser,
  Images,
  Info,
  Library,
  Link2,
  Minimize2,
  MoreVertical,
  ShieldCheck,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import {
  ClickPopover,
  IconButton,
  LinkChip,
  MenuActionRow,
  PopoverItem,
  SectionLabel,
  StatBlock,
  Tooltip,
} from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { useUiStore } from '../../stores/uiStore';
import { SourceSizeCap } from './SourceSizeCap';
import { DownloadButton } from './DownloadButton';
import { useSourceActions } from './useSourceActions';
import { SourceFieldRow } from './SourceFieldRow';
import { SOURCE_KINDS } from '../../utils/libraryCatalogFilters';
import { summarizeAvailability } from '../../services/vaultService';
import { humanSize } from '../../utils';
import type {
  LibraryCatalogEntry,
  LibrarySourceDetail,
  SourceCollection,
  SourceField,
  Workspace,
} from '../../types';

const INSPECTOR_MIN = 320;
const INSPECTOR_MAX = 560;
const VIEWER_MIN = 480;

function clampWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

interface LibrarySourcePageProps {
  detail: LibrarySourceDetail;
  /** La riga di catalogo della stessa opera: porta disponibilità e comandi.
   *  Manca solo finché il catalogo non è stato letto. */
  entry?: LibraryCatalogEntry;
  /** Etichetta leggibile della biblioteca, già risolta dal chiamante
   *  (che ha già l'elenco provider caricato per il filtro del catalogo). */
  providerLabel?: string;
  workspaces: Workspace[];
  onBack: () => void;
  onRemoved: () => void;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
  onToggleLink: (workspaceId: string, linked: boolean) => void;
  /** Corregge un campo a mano; `null` riporta il valore della biblioteca. */
  onCorrectField: (field: SourceField, value: string | null) => Promise<void>;
  collections: SourceCollection[];
  onSetCollection: (collectionId: string, member: boolean) => Promise<void>;
  onCreateCollection: (name: string) => Promise<void>;
}

/** La scheda di un'opera: cosa è, quanto ne hai, cosa puoi farci, dove sta. */
export function LibrarySourcePage({
  detail,
  entry,
  providerLabel,
  workspaces,
  onBack,
  onRemoved,
  onSetArchived,
  onRefresh,
  onToggleLink,
  onCorrectField,
  collections,
  onSetCollection,
  onCreateCollection,
}: LibrarySourcePageProps) {
  const { t } = useTranslation();
  const inspectorWidth = useUiStore((state) => state.librarySourceInspectorWidth);
  const setInspectorWidth = useUiStore((state) => state.setLibrarySourceInspectorWidth);
  const [inspectorPanel, setInspectorPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  const initialInspectorWidth = useRef(clampWidth(inspectorWidth || 400, INSPECTOR_MIN, INSPECTOR_MAX));

  const persistLayout = () => {
    if (!inspectorPanel || inspectorPanel.isCollapsed()) return;
    const px = Math.round(inspectorPanel.getSize().inPixels);
    if (px !== inspectorWidth) setInspectorWidth(px);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-panel">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-editorial-border px-3 py-2">
        <IconButton size="sm" onClick={onBack} title={t('areas.library.backToCatalogue')}>
          <X size={14} />
        </IconButton>
        {entry && (
          <SourceHeaderActions
            entry={entry}
            onRemoved={onRemoved}
            onSetArchived={onSetArchived}
            onRefresh={onRefresh}
          />
        )}
      </header>

      <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistLayout}>
        <Panel id="library-source-viewer" minSize={VIEWER_MIN} className="flex min-w-0 flex-col">
          {/* Il visore delle pagine nasce come lavoro a sé e verrà riusato anche
              dallo Studio di trascrizione: qui resta il posto dove andrà, con
              la stessa dimensione minima che avrà da riempito. */}
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-editorial-muted">
            <span className="flex flex-col items-center gap-2">
              <Images size={28} className="text-editorial-muted/60" aria-hidden="true" />
              {t('areas.library.viewerComingSoon')}
            </span>
          </div>
        </Panel>

        <Separator
          onPointerDown={() => setDragging(true)}
          className={`group/sep relative z-10 flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
            dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
          }`}
        >
          <span
            aria-hidden="true"
            className={`relative h-7 w-px rounded-full transition-colors ${
              dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
            }`}
          />
        </Separator>

        <Panel
          id="library-source-inspector"
          minSize={INSPECTOR_MIN}
          maxSize={INSPECTOR_MAX}
          defaultSize={initialInspectorWidth.current}
          panelRef={setInspectorPanel}
          className={`flex min-w-0 flex-col overflow-y-auto custom-scrollbar border-l border-editorial-border bg-surface-panel ${
            dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
          }`}
        >
          <div className="flex flex-col gap-6 px-4 py-5">
            <DataSection detail={detail} entry={entry} onCorrectField={onCorrectField} />
            <SourceInfoSection detail={detail} providerLabel={providerLabel} />
            <CopiesSection detail={detail} entry={entry} onRefresh={onRefresh} />

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

            <section className="space-y-2">
              <SectionLabel icon={Tags} label={t('areas.library.collectionsSection')} />
              <CollectionPicker
                collections={collections}
                memberIds={detail.collections.map((collection) => collection.id)}
                onSetCollection={onSetCollection}
                onCreateCollection={onCreateCollection}
              />
            </section>
          </div>
        </Panel>
      </Group>
    </div>
  );
}

/** Tutti i campi anagrafici: i cinque correggibili a mano più quelli che la
 *  biblioteca dichiara e nessuno tocca. I campi vuoti non compaiono. */
function DataSection({
  detail,
  entry,
  onCorrectField,
}: {
  detail: LibrarySourceDetail;
  entry?: LibraryCatalogEntry;
  onCorrectField: (field: SourceField, value: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const readonlyFields: Array<[string, string | null]> = [
    [t('areas.library.contributorsField'), detail.contributors.join(' · ') || null],
    [t('areas.library.volumeField'), detail.volume],
    [t('areas.library.subjectsField'), detail.subjects.join(' · ') || null],
    [t('areas.library.publisherField'), detail.publisher],
    [t('areas.library.rightsField'), detail.rights.join(' · ') || null],
    [t('areas.library.physicalDescriptionField'), detail.physicalDescription],
    [t('areas.library.descriptionField'), detail.description],
  ];

  return (
    <section className="space-y-2">
      <SectionLabel icon={Info} label={t('areas.library.detailsSection')} />
      <dl className="space-y-2.5">
        <SourceFieldRow
          label={t('areas.library.titleField')}
          value={detail.source.title}
          original={detail.original.title}
          onSave={(value) => onCorrectField('title', value)}
        />
        <SourceFieldRow
          label={t('areas.library.kind')}
          value={t(`areas.library.kindLabels.${detail.source.kind}`)}
          editableValue={detail.source.kind}
          original={
            detail.original.kind === undefined
              ? undefined
              : t(`areas.library.kindLabels.${detail.original.kind}`)
          }
          options={SOURCE_KINDS.map((kind) => ({
            value: kind,
            label: t(`areas.library.kindLabels.${kind}`),
          }))}
          onSave={(value) => onCorrectField('kind', value)}
        />
        <SourceFieldRow
          label={t('areas.library.creatorField')}
          value={detail.creator ?? ''}
          original={detail.original.creator}
          onSave={(value) => onCorrectField('creator', value)}
        />
        <SourceFieldRow
          label={t('areas.library.dateField')}
          value={detail.date ?? ''}
          original={detail.original.date}
          onSave={(value) => onCorrectField('date', value)}
        />
        <SourceFieldRow
          label={t('areas.library.languageField')}
          value={detail.source.primaryLanguage ?? ''}
          original={detail.original.primary_language}
          onSave={(value) => onCorrectField('primary_language', value)}
        />
        {readonlyFields
          .filter((field): field is [string, string] => Boolean(field[1]))
          .map(([label, value]) => (
            <StatBlock key={label} label={label} value={value} />
          ))}
        {entry && (
          <>
            <StatBlock
              label={t('areas.library.availabilityField')}
              value={availabilityText(entry, t)}
            />
            {entry.localBytes > 0 && (
              <StatBlock label={t('areas.library.occupiedField')} value={humanSize(entry.localBytes)} />
            )}
          </>
        )}
        <StatBlock
          label={t('areas.library.statusField')}
          value={
            detail.source.status === 'archived'
              ? t('areas.library.statusArchived')
              : t('areas.library.statusActive')
          }
        />
      </dl>
    </section>
  );
}

/** La provenienza dell'opera: riconoscibile a colpo d'occhio, con i
 *  riferimenti specifici della biblioteca — testo semplice, mai una pastiglia
 *  colorata (il design system la vieta per i metadati di provenienza). */
function SourceInfoSection({
  detail,
  providerLabel,
}: {
  detail: LibrarySourceDetail;
  providerLabel?: string;
}) {
  const { t } = useTranslation();
  const externalRef = detail.source.externalRef;
  const identifier =
    externalRef && detail.providerKey && externalRef.startsWith(`${detail.providerKey}:`)
      ? externalRef.slice(detail.providerKey.length + 1)
      : externalRef;

  const hasContent =
    providerLabel || identifier || detail.holdingInstitution || detail.pageUrl || detail.catalogUrl;
  if (!hasContent) return null;

  return (
    <section className="space-y-2">
      <SectionLabel icon={Library} label={t('areas.library.sourceSection')} />
      <dl className="space-y-2.5">
        {providerLabel && <StatBlock label={t('areas.library.sourceProviderField')} value={providerLabel} />}
        {identifier && <StatBlock label={t('areas.library.sourceIdentifierField')} value={identifier} />}
        {detail.holdingInstitution && (
          <StatBlock label={t('areas.library.sourceHoldingField')} value={detail.holdingInstitution} />
        )}
        {detail.pageUrl && (
          <StatBlock label={t('areas.library.sourcePageUrlField')} value={detail.pageUrl} href={detail.pageUrl} />
        )}
        {detail.catalogUrl && (
          <StatBlock
            label={t('areas.library.sourceCatalogUrlField')}
            value={detail.catalogUrl}
            href={detail.catalogUrl}
          />
        )}
      </dl>
    </section>
  );
}

/** Le copie digitali dell'opera: cosa sono (manifesto IIIF, PDF, altro),
 *  dove stanno (solo online o anche sul computer, a quale risoluzione), e i
 *  comandi per-copia — scarica, verifica, comprimi, libera spazio. Sono
 *  comandi sulla copia, non sull'opera: archiviare e rimuovere restano nel
 *  menu dell'intestazione. */
function CopiesSection({
  detail,
  entry,
  onRefresh,
}: {
  detail: LibrarySourceDetail;
  entry?: LibraryCatalogEntry;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const actions = useSourceActions(
    entry ?? PLACEHOLDER_ENTRY,
    { onRemove: () => {}, onSetArchived: async () => {}, onRefresh },
  );

  return (
    <section className="space-y-2">
      <SectionLabel icon={BookOpenText} label={t('areas.library.copiesSection')} />
      <ul className="space-y-2">
        {detail.versions.map((version) => {
          const isEntryVersion = Boolean(entry && version.id === entry.versionId);
          return (
            <li
              key={version.id}
              className="space-y-2.5 rounded-md border border-editorial-border bg-surface-elevated px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
                  {t(`areas.library.versionKindLabels.${version.versionKind}`)}
                </span>
                {isEntryVersion && entry && (
                  <CopyActionsRow entry={entry} actions={actions} />
                )}
              </div>
              <p className="break-all font-mono text-xs text-editorial-muted">{version.sourceUrl}</p>
              {isEntryVersion && entry && (
                <div className="space-y-2 border-t border-editorial-border/60 pt-2.5">
                  {entry.sizes.map((size) => (
                    <StatBlock
                      key={size.sizeTag}
                      label={
                        t('areas.library.resolutionField', { tag: size.sizeTag }) +
                        (size.sizeTag === entry.principalSize
                          ? ` (${t('areas.library.resolutionPrincipal')})`
                          : '')
                      }
                      value={[
                        t('areas.library.resolutionSummary', {
                          count: size.pages,
                          pages: size.pages,
                          size: humanSize(size.bytes),
                        }),
                        size.missing > 0
                          ? t('areas.library.resolutionMissing', { count: size.missing })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                  <SourceSizeCap versionId={version.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const PLACEHOLDER_ENTRY: LibraryCatalogEntry = {
  source: { id: '', title: '', kind: 'other', primaryLanguage: null, externalRef: null, status: 'active', archivedAt: null, createdAt: '' },
  versionId: null,
  manifestUrl: null,
  thumbnailUrl: null,
  creator: null,
  date: null,
  expectedPages: null,
  localPages: 0,
  localBytes: 0,
  sizes: [],
  principalSize: null,
  workspaces: [],
  providerKey: null,
  original: {},
  collections: [],
};

/** Scarica/Verifica/Comprimi/Libera spazio: comandi sulla copia, montati
 *  dentro "Copie digitali" invece che nell'intestazione della pagina. */
function CopyActionsRow({ entry, actions }: { entry: LibraryCatalogEntry; actions: ReturnType<typeof useSourceActions> }) {
  const { t } = useTranslation();
  const { busy } = actions;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <DownloadButton entry={entry} actions={actions} size="xs" />
      <IconButton
        size="xs"
        onClick={() => void actions.verify()}
        disabled={busy || entry.localPages === 0}
        title={t('areas.library.verify')}
      >
        <ShieldCheck size={13} />
      </IconButton>
      <IconButton
        size="xs"
        onClick={() => void actions.optimise()}
        disabled={busy || entry.localPages === 0}
        title={t('areas.library.optimizeAction')}
      >
        <Minimize2 size={13} />
      </IconButton>
      <IconButton
        size="xs"
        onClick={() => void actions.freeSpace()}
        disabled={busy || entry.localPages === 0}
        title={t('areas.library.freeSpace')}
      >
        <Eraser size={13} />
      </IconButton>
    </div>
  );
}

/** Comandi sull'opera intera (non su una copia): un pulsante primario per lo
 *  scaricamento e un menu per Archivia/Rimuovi — non più icone sparse in fila. */
function SourceHeaderActions({
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
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const actions = useSourceActions(entry, { onRemove: onRemoved, onSetArchived, onRefresh });
  const { busy, runningJob, archived, summary } = actions;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="mr-1 flex h-6 w-6 items-center justify-center text-[11px] text-editorial-muted">
        {runningJob ? (
          <Tooltip label={t('areas.library.downloadRunning')} side="top">
            <span className="text-editorial-accent">{Math.round(runningJob.progress * 100)}%</span>
          </Tooltip>
        ) : summary.availability === 'complete' ? (
          <Tooltip label={t('areas.library.availabilityComplete')} side="top">
            <span aria-label={t('areas.library.availabilityComplete')}>
              <Check size={15} />
            </span>
          </Tooltip>
        ) : null}
      </span>
      <DownloadButton entry={entry} actions={actions} size="md" />
      <ClickPopover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <IconButton size="md" title={t('areas.library.moreActions')} ariaPressed={menuOpen}>
            <MoreVertical size={15} />
          </IconButton>
        }
      >
        <div className="min-w-44 py-1">
          <MenuActionRow
            icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            label={archived ? t('areas.library.restore') : t('areas.library.archive')}
            onClick={() => { setMenuOpen(false); void actions.toggleArchived(); }}
            disabled={busy}
          />
          <MenuActionRow
            icon={<Trash2 size={14} />}
            label={t('areas.library.remove')}
            tone="danger"
            onClick={() => { setMenuOpen(false); void actions.askRemoval(); }}
            disabled={busy}
          />
        </div>
      </ClickPopover>
    </div>
  );
}

/**
 * Le collezioni dell'opera: etichette che si aggiungono e si tolgono, sempre
 * reversibili. Toglierne una non tocca l'opera né le altre collezioni.
 */
function CollectionPicker({
  collections,
  memberIds,
  onSetCollection,
  onCreateCollection,
}: {
  collections: SourceCollection[];
  memberIds: string[];
  onSetCollection: (collectionId: string, member: boolean) => Promise<void>;
  onCreateCollection: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState('');
  const member = new Set(memberIds);
  const available = collections.filter((collection) => !member.has(collection.id));

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    void onCreateCollection(name);
    setNewName('');
    setPicking(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {collections
        .filter((collection) => member.has(collection.id))
        .map((collection) => (
          <LinkChip
            key={collection.id}
            label={collection.name}
            hint={t('areas.library.removeFromCollection', { name: collection.name })}
            onClick={() => void onSetCollection(collection.id, false)}
            icon={X}
          />
        ))}
      <ClickPopover
        open={picking}
        onOpenChange={setPicking}
        trigger={
          <IconButton size="sm" title={t('areas.library.addToCollection')} ariaPressed={picking}>
            <Tags size={13} />
          </IconButton>
        }
      >
        <div className="flex min-w-52 flex-col gap-1 p-2">
          {available.map((collection) => (
            <PopoverItem
              key={collection.id}
              label={collection.name}
              onSelect={() => {
                setPicking(false);
                void onSetCollection(collection.id, true);
              }}
            />
          ))}
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
            }}
            placeholder={t('areas.library.newCollectionPlaceholder')}
            aria-label={t('areas.library.newCollectionLabel')}
            className={`${FIELD_CLASSNAME} py-1 text-xs`}
          />
        </div>
      </ClickPopover>
    </div>
  );
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
