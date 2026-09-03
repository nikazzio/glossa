import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BookOpenText,
  Check,
  Images,
  Info,
  Library,
  Link2,
  type LucideIcon,
  MoreVertical,
  NotebookText,
  RefreshCw,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import {
  ClickPopover,
  IconButton,
  InspectorShell,
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
import { confirm } from '../../stores/confirmStore';
import { useSourceActions } from './useSourceActions';
import { CopiesSection, resolutionLabel } from './CopiesSection';
import { SourceFieldRow } from './SourceFieldRow';
import { MarkdownEditor } from '../common';
import { PageViewer } from '../viewer/PageViewer';
import { useDebounce } from '../../hooks/useDebounce';
import { summarizeAvailability } from '../../services/vaultService';
import { humanSize } from '../../utils';
import type {
  LibraryCatalogEntry,
  LibrarySourceDetail,
  SourceCollection,
  SourceField,
  Workspace,
} from '../../types';

const INSPECTOR_COLLAPSED = 56;
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
  /** Rilegge il manifesto e riscrive i dati anagrafici, cancellando le
   *  correzioni a mano (Note escluse). */
  onResyncSource: () => Promise<void>;
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
  onResyncSource,
}: LibrarySourcePageProps) {
  const { t } = useTranslation();
  const iiifVersions = detail.versions.filter(
    (version) => version.versionKind === 'iiif_manifest' && version.sourceUrl,
  );
  const manifestVersion = iiifVersions.find((version) => version.isPrimary) ?? iiifVersions[0];
  const [activeTab, setActiveTab] = useState<InspectorTabId>('info');
  const inspectorWidth = useUiStore((state) => state.librarySourceInspectorWidth);
  const setInspectorWidth = useUiStore((state) => state.setLibrarySourceInspectorWidth);
  const [inspectorPanel, setInspectorPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const initialInspectorWidth = useRef(clampWidth(inspectorWidth || 400, INSPECTOR_MIN, INSPECTOR_MAX));

  const persistLayout = () => {
    if (!inspectorPanel || inspectorPanel.isCollapsed()) return;
    const px = Math.round(inspectorPanel.getSize().inPixels);
    if (px !== inspectorWidth) setInspectorWidth(px);
  };

  // Stesso meccanismo della colonna Insight della traduzione: il collasso è
  // del riquadro vero (react-resizable-panels), lo stato qui è solo lo
  // specchio di quel che il riquadro dice dopo ogni ridimensionamento.
  const syncInspectorCollapsed = () => {
    setInspectorCollapsed(inspectorPanel?.isCollapsed() ?? false);
  };
  const toggleInspectorCollapsed = (next: boolean) => {
    if (!inspectorPanel) return;
    if (next) inspectorPanel.collapse();
    else inspectorPanel.expand();
    setInspectorCollapsed(next);
  };

  return (
    <Group orientation="horizontal" className="flex h-full min-h-0 flex-1" onLayoutChanged={persistLayout}>
      <Panel id="library-source-viewer" minSize={VIEWER_MIN} className="flex min-w-0 flex-col bg-surface-panel">
        {/* Il visore delle pagine nasce come lavoro a sé e verrà riusato anche
            dallo Studio di trascrizione: questo componente resta la stessa
            dimensione minima predisposta prima che esistesse. */}
        {manifestVersion?.sourceUrl ? (
          <PageViewer
            key={detail.source.id}
            sourceId={detail.source.id}
            manifestUrl={manifestVersion.sourceUrl}
            providerKey={manifestVersion.providerKey}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-editorial-muted">
            <span className="flex flex-col items-center gap-2">
              <Images size={28} className="text-editorial-muted/60" aria-hidden="true" />
              {t('areas.library.viewerComingSoon')}
            </span>
          </div>
        )}
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
        collapsible
        collapsedSize={INSPECTOR_COLLAPSED}
        minSize={INSPECTOR_MIN}
        maxSize={INSPECTOR_MAX}
        defaultSize={initialInspectorWidth.current}
        panelRef={setInspectorPanel}
        onResize={syncInspectorCollapsed}
        className={`flex min-w-0 flex-col border-l border-editorial-border bg-surface-panel ${
          dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
        }`}
      >
        {/* Guscio identico alla colonna Insight della traduzione (stesso
            componente condiviso): tre tab oggi, un domani se ne può
            aggiungere un'altra (es. il visore), e la stessa versione
            collassata — sono la stessa colonna, non due da tenere allineate
            a mano. */}
        <InspectorShell
          ariaLabel={t('areas.library.inspectorLabel')}
          tabs={INSPECTOR_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as InspectorTabId)}
          panelIcon={<Info size={15} />}
          panelLabel={detail.source.title}
          collapsed={inspectorCollapsed}
          onCollapsedChange={toggleInspectorCollapsed}
          headerActions={
            <IconButton size="sm" onClick={onBack} title={t('areas.library.backToCatalogue')}>
              <X size={14} />
            </IconButton>
          }
          actions={entry && (
            <SourceHeaderActions
              entry={entry}
              onRemoved={onRemoved}
              onSetArchived={onSetArchived}
              onRefresh={onRefresh}
            />
          )}
        >
          {activeTab === 'notes' ? (
            <div className="flex h-full min-h-0 flex-1 flex-col p-4">
              <NotesTab
                sourceId={detail.source.id}
                notes={detail.notes}
                onCorrectField={onCorrectField}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-6 px-4 py-5">
              {activeTab === 'info' ? (
                <>
                  <DataSection
                    detail={detail}
                    entry={entry}
                    onCorrectField={onCorrectField}
                    onResyncSource={onResyncSource}
                  />
                  <SourceInfoSection detail={detail} providerLabel={providerLabel} />
                </>
              ) : activeTab === 'copies' ? (
                <CopiesSection detail={detail} entry={entry} onRefresh={onRefresh} />
              ) : (
                <>
                  <Section icon={Link2} label={t('areas.library.linkedWorkspaces')}>
                    <WorkspaceLinkPicker
                      workspaces={workspaces}
                      linkedIds={detail.linkedWorkspaceIds}
                      onToggleLink={onToggleLink}
                    />
                  </Section>

                  <Section icon={Tags} label={t('areas.library.collectionsSection')}>
                    <CollectionPicker
                      collections={collections}
                      memberIds={detail.collections.map((collection) => collection.id)}
                      onSetCollection={onSetCollection}
                      onCreateCollection={onCreateCollection}
                    />
                  </Section>
                </>
              )}
            </div>
          )}
        </InspectorShell>
      </Panel>
    </Group>
  );
}

type InspectorTabId = 'info' | 'copies' | 'links' | 'notes';

const INSPECTOR_TABS: { id: InspectorTabId; labelKey: string; icon: ReactNode }[] = [
  { id: 'info', labelKey: 'areas.library.infoTab', icon: <Info size={16} /> },
  { id: 'copies', labelKey: 'areas.library.copiesTab', icon: <BookOpenText size={16} /> },
  { id: 'links', labelKey: 'areas.library.linksTab', icon: <Link2 size={16} /> },
  { id: 'notes', labelKey: 'areas.library.notesTab', icon: <NotebookText size={16} /> },
];

/** Intestazione di sezione con un filo sotto: basta a distinguerla dal
 *  contenuto senza introdurre un altro stile di riquadro nella pagina. */
function Section({
  icon,
  label,
  actions,
  children,
}: {
  icon: LucideIcon;
  label: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-editorial-border/70 pb-1.5">
        <SectionLabel icon={icon} label={label} />
        {actions}
      </div>
      {children}
    </section>
  );
}

/** I workspace collegati come etichette rimovibili, più un comando per
 *  collegarne un altro — stesso pattern già in uso nella riga di catalogo,
 *  invece dell'elenco di ogni workspace con un interruttore acceso/spento. */
function WorkspaceLinkPicker({
  workspaces,
  linkedIds,
  onToggleLink,
}: {
  workspaces: Workspace[];
  linkedIds: string[];
  onToggleLink: (workspaceId: string, linked: boolean) => void;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const linked = new Set(linkedIds);
  const linkedWorkspaces = workspaces.filter((workspace) => linked.has(workspace.id));
  const available = workspaces.filter((workspace) => !linked.has(workspace.id));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {linkedWorkspaces.map((workspace) => (
        <LinkChip
          key={workspace.id}
          label={workspace.name}
          hint={t('areas.library.unlinkWorkspace', { name: workspace.name })}
          onClick={() => onToggleLink(workspace.id, false)}
        />
      ))}
      {available.length > 0 && (
        <ClickPopover
          open={picking}
          onOpenChange={setPicking}
          trigger={
            <IconButton size="sm" title={t('areas.library.linkToWorkspace')} ariaPressed={picking}>
              <Link2 size={13} />
            </IconButton>
          }
        >
          <ul className="flex min-w-40 flex-col py-1">
            {available.map((workspace) => (
              <li key={workspace.id} className="flex">
                <PopoverItem
                  label={workspace.name}
                  onSelect={() => {
                    setPicking(false);
                    onToggleLink(workspace.id, true);
                  }}
                />
              </li>
            ))}
          </ul>
        </ClickPopover>
      )}
    </div>
  );
}

/** Tutti i campi anagrafici oggi in scheda: quattro correggibili a mano
 *  (titolo, autore, data, lingua) più quelli che la biblioteca dichiara e
 *  nessuno tocca — natura dell'origine inclusa, di proposito: è un fatto
 *  della biblioteca, non un dato di Niki. Il motore sa correggere anche
 *  questi campi e gli altri anagrafici non ancora in scheda; quali portare
 *  davvero a schermo resta da decidere. Ogni campo resta sempre in vista,
 *  «—» quando non c'è ancora un dato: due schede diverse non devono sembrare
 *  strutturate in modo diverso solo perché una biblioteca ne sa di meno. */
function DataSection({
  detail,
  entry,
  onCorrectField,
  onResyncSource,
}: {
  detail: LibrarySourceDetail;
  entry?: LibraryCatalogEntry;
  onCorrectField: (field: SourceField, value: string | null) => Promise<void>;
  onResyncSource: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [resyncing, setResyncing] = useState(false);
  const resync = async () => {
    const confirmed = await confirm({
      title: t('areas.library.resyncTitle'),
      message: t('areas.library.resyncMessage'),
      confirmLabel: t('areas.library.resyncConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    setResyncing(true);
    try {
      await onResyncSource();
    } finally {
      setResyncing(false);
    }
  };
  // Le stesse etichette per ogni opera, che la biblioteca le abbia dichiarate
  // o no: un campo che sparisse quando è vuoto farebbe sembrare due schede
  // strutturate in modo diverso, invece è solo la fonte che ne sa di meno.
  // StatBlock mostra sempre l'etichetta, con «—» al posto del valore assente.
  const readonlyFields: Array<[string, string]> = [
    [t('areas.library.contributorsField'), detail.contributors.join(' · ')],
    [t('areas.library.volumeField'), detail.volume ?? ''],
    [t('areas.library.subjectsField'), detail.subjects.join(' · ')],
    [t('areas.library.publisherField'), detail.publisher ?? ''],
    [t('areas.library.rightsField'), detail.rights.join(' · ')],
    [t('areas.library.physicalDescriptionField'), detail.physicalDescription ?? ''],
    [t('areas.library.descriptionField'), detail.description ?? ''],
    [t('areas.library.originPlaceField'), detail.originPlace ?? ''],
    [t('areas.library.provenanceField'), detail.provenance.join(' · ')],
    [t('areas.library.seriesField'), detail.series ?? ''],
    [t('areas.library.genreFormField'), detail.genreForm.join(' · ')],
    [t('areas.library.standardIdentifierField'), detail.standardIdentifier ?? ''],
    [t('areas.library.coverageField'), detail.coverage.join(' · ')],
    [t('areas.library.relatedWorksField'), detail.relatedWorks.join(' · ')],
  ];

  return (
    <Section
      icon={Info}
      label={t('areas.library.detailsSection')}
      actions={
        <IconButton
          size="sm"
          onClick={() => void resync()}
          disabled={resyncing}
          title={t('areas.library.resyncAction')}
        >
          <RefreshCw size={13} className={resyncing ? 'animate-spin' : undefined} />
        </IconButton>
      }
    >
      <dl className="space-y-2.5">
        <SourceFieldRow
          label={t('areas.library.titleField')}
          value={detail.source.title}
          original={detail.original.title}
          onSave={(value) => onCorrectField('title', value)}
        />
        <StatBlock
          label={t('areas.library.kind')}
          // Libri aggiunti prima che "natura" perdesse i valori di formato
          // (pdf/iiif/web) hanno ancora quei vecchi valori salvati: mostrano
          // "Altro" come qualunque valore che oggi non si riconosce più,
          // non la parola tecnica grezza.
          value={t(`areas.library.kindLabels.${detail.source.kind}`, {
            defaultValue: t('areas.library.kindLabels.other'),
          })}
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
        {readonlyFields.map(([label, value]) => (
          <StatBlock key={label} label={label} value={value} />
        ))}
        {/* Come gli altri campi: sempre in vista, «—» quando non c'è ancora
            un dato (nessuna pagina dichiarata, entry non ancora caricato). */}
        <StatBlock
          label={t('areas.library.pagesField')}
          value={
            entry && entry.expectedPages !== null && entry.expectedPages > 0
              ? t('areas.library.pageCount', { count: entry.expectedPages })
              : ''
          }
        />
        <StatBlock
          label={t('areas.library.availabilityField')}
          value={entry ? availabilityText(entry, t) : ''}
        />
        <StatBlock
          label={t('areas.library.occupiedField')}
          value={entry ? humanSize(entry.localBytes) : ''}
        />
        <StatBlock
          label={t('areas.library.statusField')}
          value={
            detail.source.status === 'archived'
              ? t('areas.library.statusArchived')
              : t('areas.library.statusActive')
          }
        />
      </dl>
    </Section>
  );
}

/** La provenienza dell'opera: riconoscibile a colpo d'occhio, con i
 *  riferimenti specifici della biblioteca — testo semplice, mai una pastiglia
 *  colorata (il design system la vieta per i metadati di provenienza).
 *
 *  Sempre presente, come le altre sezioni anagrafiche: un'opera aggiunta
 *  riconoscendo una segnatura/indirizzo diretto (invece che da un risultato
 *  di ricerca) non porta fondo/pagina web/scheda del catalogo — quei campi
 *  restano «—», la sezione non sparisce. */
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

  return (
    <Section icon={Library} label={t('areas.library.sourceSection')}>
      <dl className="space-y-2.5">
        <StatBlock label={t('areas.library.sourceProviderField')} value={providerLabel ?? ''} />
        <StatBlock label={t('areas.library.sourceIdentifierField')} value={identifier ?? ''} />
        <StatBlock label={t('areas.library.sourceHoldingField')} value={detail.holdingInstitution ?? ''} />
        <StatBlock
          label={t('areas.library.sourcePageUrlField')}
          value={detail.pageUrl ?? ''}
          href={detail.pageUrl ?? undefined}
        />
        <StatBlock
          label={t('areas.library.sourceCatalogUrlField')}
          value={detail.catalogUrl ?? ''}
          href={detail.catalogUrl ?? undefined}
        />
      </dl>
    </Section>
  );
}

const NOTES_SAVE_DELAY_MS = 800;

/** Le note libere sull'opera: sempre di Niki, mai dalla biblioteca — stesso
 *  editor con formattazione già in uso per le note della traduzione, non un
 *  campo a parte scritto da zero. Salva da sola, con un breve ritardo dopo
 *  che si smette di scrivere, come un campo di testo qualunque della scheda. */
function NotesTab({
  sourceId,
  notes,
  onCorrectField,
}: {
  sourceId: string;
  notes: string | null;
  onCorrectField: (field: SourceField, value: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(notes ?? '');
  const debouncedDraft = useDebounce(draft, NOTES_SAVE_DELAY_MS);
  const savedRef = useRef(notes ?? '');

  // Un'altra opera è stata aperta: si riparte dalle sue note, non da quelle
  // lasciate a metà sull'opera precedente.
  useEffect(() => {
    setDraft(notes ?? '');
    savedRef.current = notes ?? '';
  }, [sourceId, notes]);

  useEffect(() => {
    if (debouncedDraft === savedRef.current) return;
    savedRef.current = debouncedDraft;
    void onCorrectField('notes', debouncedDraft || null);
  }, [debouncedDraft, onCorrectField]);

  return (
    <MarkdownEditor
      identityKey={sourceId}
      value={draft}
      onChange={setDraft}
      markdownEnabled
      fillHeight
      initialMode="preview"
      placeholder={t('areas.library.notesPlaceholder')}
    />
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
  // Un'opera in Biblioteca è sempre online: quello che cambia è se c'è
  // *anche* qualcosa sul computer, non se è raggiungibile. Quando c'è,
  // si dice anche a quale risoluzione — altrimenti "immagini locali" da
  // solo non dice a quanto sono state scaricate.
  const online = t('areas.library.viewOnline');
  if (summary.availability === 'catalogued') return online;
  const resolution = entry.principalSize ? resolutionLabel(entry.principalSize, t) : null;
  const local =
    summary.availability === 'complete'
      ? t('areas.library.availabilityComplete')
      : t('areas.library.availabilityPartial', { done: summary.presentPages, total: summary.expectedPages });
  return resolution ? `${online} · ${local} (${resolution})` : `${online} · ${local}`;
}
