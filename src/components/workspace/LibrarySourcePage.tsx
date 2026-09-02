import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BookOpenText,
  Check,
  Download,
  Eraser,
  Images,
  Info,
  Library,
  Link2,
  Loader2,
  type LucideIcon,
  Minimize2,
  MoreVertical,
  NotebookText,
  RefreshCw,
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
  InspectorShell,
  LinkChip,
  MenuActionRow,
  PopoverItem,
  SectionLabel,
  Select,
  StatBlock,
  Tooltip,
} from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore } from '../../stores/jobsStore';
import { enqueueSourceDownload, isTerminal } from '../../services/jobsService';
import { versionProviderKey } from '../../services/libraryService';
import {
  enqueueOptimization,
  getOptimizeLongEdge,
  getOptimizeQuality,
  OPTIMIZE_LONG_EDGES,
  OPTIMIZE_QUALITIES,
} from '../../services/optimizeService';
import { MAX_SIZE_CAP, SIZE_CAPS } from '../../services/downloadSettingsService';
import { confirm } from '../../stores/confirmStore';
import { toast } from 'sonner';
import { SourceSizeCap } from './SourceSizeCap';
import { useSourceActions } from './useSourceActions';
import { SourceFieldRow } from './SourceFieldRow';
import { MarkdownEditor } from '../common';
import { useDebounce } from '../../hooks/useDebounce';
import { summarizeAvailability } from '../../services/vaultService';
import { humanSize } from '../../utils';
import type {
  LibraryCatalogEntry,
  LibrarySourceDetail,
  LibrarySourceVersion,
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

/** Le copie digitali dell'opera: cosa sono (manifesto IIIF, PDF, altro),
 *  dove stanno (solo online o anche sul computer), i comandi generali
 *  (scarica a una risoluzione scelta, verifica, libera spazio) e — per
 *  ognuna delle risoluzioni davvero presenti — il suo comando di
 *  compressione. Sono comandi sulla copia, non sull'opera: archiviare e
 *  rimuovere restano nel menu dell'intestazione. */
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

  return (
    // Niente intestazione di sezione qui: la tab la dà già ("Copie digitali").
    // Niente riquadro a sfondo: la tab stessa è già il contenitore, un'altra
    // cornice attorno sarebbe una scatola dentro la scatola.
    <ul className="divide-y divide-editorial-border/70">
      {detail.versions.map((version) => {
        const isEntryVersion = Boolean(entry && version.id === entry.versionId);
        return (
          <li key={version.id} className="space-y-3 py-4 first:pt-0">
            <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
              {t(`areas.library.versionKindLabels.${version.versionKind}`)}
            </span>

            {version.sourceUrl && (
              <StatBlock label={t('areas.library.sourceUrlField')} value={version.sourceUrl} href={version.sourceUrl} />
            )}

            {isEntryVersion && entry && (
              <PrimaryCopyDetails entry={entry} version={version} onRefresh={onRefresh} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** L'etichetta di una risoluzione — con l'unità di misura, non il numero
 *  grezzo, e "Massima disponibile" per l'ultimo scalino della scala. */
function resolutionLabel(tag: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (tag === MAX_SIZE_CAP) return t('settings.download.sizeCapMax');
  // Solo un numero è davvero un lato lungo in pixel: una biblioteca può
  // dichiarare una risoluzione fuori scala con un'etichetta propria (es.
  // "full"), e inventarle un'unità di misura sarebbe falso.
  return /^\d+$/.test(tag) ? t('settings.download.pixels', { value: tag }) : tag;
}

/** La copia che sta davvero sul computer (quella che descrive la riga del
 *  catalogo): in alto disponibilità e comandi generali sull'intera copia —
 *  verifica, libera spazio (cancella tutte le risoluzioni insieme:
 *  cancellarne una sola non è ancora possibile). Sotto, la scala completa
 *  delle risoluzioni che Glossa sa scaricare — non solo quelle già presenti:
 *  ognuna ha il suo comando di scarica e, se ha pagine, il suo comando di
 *  compressione con qualità scelta lì per lì. */
function PrimaryCopyDetails({
  entry,
  version,
  onRefresh,
}: {
  entry: LibraryCatalogEntry;
  version: LibrarySourceVersion;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const actions = useSourceActions(entry, { onRemove: () => {}, onSetArchived: async () => {}, onRefresh });
  const { busy, runningJob } = actions;

  const onDisk = new Map(entry.sizes.map((size) => [size.sizeTag, size]));
  // La scala che Glossa offre sempre, più eventuali misure fuori scala che la
  // biblioteca ha già dato (rare, ma non vanno nascoste se ci sono davvero).
  const extraTags = entry.sizes
    .map((size) => size.sizeTag)
    .filter((tag) => !(SIZE_CAPS as readonly string[]).includes(tag));
  const tags: string[] = [...SIZE_CAPS, ...extraTags];

  return (
    <div className="space-y-4 border-t border-editorial-border/60 pt-3">
      <StatBlock label={t('areas.library.availabilityField')} value={availabilityText(entry, t)} />

      <div className="flex items-center gap-1">
        <IconButton
          size="sm"
          onClick={() => void actions.verify()}
          disabled={busy || entry.localPages === 0}
          title={t('areas.library.verify')}
        >
          <ShieldCheck size={13} />
        </IconButton>
        <IconButton
          size="sm"
          onClick={() => void actions.freeSpace()}
          disabled={busy || entry.localPages === 0}
          title={t('areas.library.freeSpace')}
        >
          <Eraser size={13} />
        </IconButton>
        <span className="ml-1 flex-1 text-xs text-editorial-muted">
          {t('areas.library.freeSpaceWholeCopyHint')}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
          {t('areas.library.resolutionsSection')}
        </p>
        <ul className="divide-y divide-editorial-border/60 rounded-md border border-editorial-border/60">
          {tags.map((tag) => (
            <ResolutionRow
              key={tag}
              entry={entry}
              versionId={version.id}
              tag={tag}
              size={onDisk.get(tag) ?? null}
              isPrincipal={tag === entry.principalSize}
              downloadDisabled={busy || Boolean(runningJob) || !entry.manifestUrl}
            />
          ))}
        </ul>
      </div>

      {/* Preferenza per i comandi "Scarica" senza scelta — dalla riga del
          catalogo, o "verifica" che riscarica quel che manca. Qui sopra, ogni
          risoluzione si scarica già mirata, senza bisogno di impostarla prima. */}
      <SourceSizeCap versionId={version.id} />
    </div>
  );
}

/** Una risoluzione della scala — presente sul computer o no. Se non c'è
 *  ancora, "Scarica" la richiede direttamente a quella misura, senza dover
 *  prima cambiare un'impostazione altrove. Se ha pagine, "Comprimi" apre la
 *  scelta di lato lungo e qualità lì per lì — non solo quella predefinita
 *  nelle Impostazioni. */
function ResolutionRow({
  entry,
  versionId,
  tag,
  size,
  isPrincipal,
  downloadDisabled,
}: {
  entry: LibraryCatalogEntry;
  versionId: string;
  tag: string;
  size: { sizeTag: string; pages: number; bytes: number; missing: number } | null;
  isPrincipal: boolean;
  downloadDisabled: boolean;
}) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);
  const [downloading, setDownloading] = useState(false);
  const expectedPages = entry.expectedPages ?? 0;
  const isComplete = Boolean(size) && expectedPages > 0 && size!.missing === 0 && size!.pages >= expectedPages;
  const optimizeJob = jobs.find((job) => job.id === `optimize:${versionId}:${tag}` && !isTerminal(job));

  const download = async () => {
    setDownloading(true);
    try {
      const providerKey = entry.providerKey ?? (await versionProviderKey(versionId)) ?? 'generic';
      const job = await enqueueSourceDownload({
        providerKey,
        manifestUrl: entry.manifestUrl ?? '',
        versionId,
        sizeTag: tag,
      });
      applyChange(job);
      toast.success(t('areas.library.downloadQueued'));
    } catch (error: unknown) {
      toast.error(t('areas.library.downloadFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 px-2.5 py-2 text-xs">
      <span className="min-w-0">
        <span className="font-display italic text-editorial-ink">
          {resolutionLabel(tag, t)}
          {isPrincipal && (
            <span className="ml-1.5 text-[10px] not-italic uppercase tracking-wide text-editorial-accent">
              {t('areas.library.resolutionPrincipal')}
            </span>
          )}
        </span>
        <span className="ml-2 text-editorial-muted">
          {size
            ? t('areas.library.resolutionSummary', {
                count: size.pages,
                pages: size.pages,
                size: humanSize(size.bytes),
              })
            : t('areas.library.resolutionNotDownloaded')}
          {size && size.missing > 0 && ` · ${t('areas.library.resolutionMissing', { count: size.missing })}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <IconButton
          size="xs"
          onClick={() => void download()}
          disabled={downloadDisabled || downloading || isComplete}
          title={isComplete ? t('areas.library.resolutionComplete') : t('areas.library.download')}
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        </IconButton>
        <CompressButton versionId={versionId} tag={tag} disabled={!size || size.pages === 0} running={Boolean(optimizeJob)} />
      </span>
    </li>
  );
}

/** Comprimi con la qualità scelta lì per lì, non solo quella predefinita
 *  nelle Impostazioni — parte già valorizzata con quella, la si cambia solo
 *  se serve per questa risoluzione. */
function CompressButton({
  versionId,
  tag,
  disabled,
  running,
}: {
  versionId: string;
  tag: string;
  disabled: boolean;
  running: boolean;
}) {
  const { t } = useTranslation();
  const applyChange = useJobsStore((state) => state.applyChange);
  const [open, setOpen] = useState(false);
  const [longEdge, setLongEdge] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const openChange = async (next: boolean) => {
    setOpen(next);
    if (next && longEdge === null) {
      const [defaultEdge, defaultQuality] = await Promise.all([getOptimizeLongEdge(), getOptimizeQuality()]);
      setLongEdge(defaultEdge);
      setQuality(defaultQuality);
    }
  };

  const confirmCompress = async () => {
    if (longEdge === null || quality === null) return;
    setBusy(true);
    try {
      const job = await enqueueOptimization(versionId, tag, longEdge, quality);
      applyChange(job);
      toast.success(t('areas.library.optimizeQueued'));
      setOpen(false);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('download_in_corso')) {
        toast.info(t('areas.library.optimizeWhileDownloading'));
      } else {
        toast.error(t('areas.library.optimizeFailed'), { description: reason });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClickPopover
      open={open}
      onOpenChange={(next) => void openChange(next)}
      trigger={
        <IconButton size="xs" disabled={disabled || running} title={t('areas.library.optimizeAction')} ariaPressed={open}>
          <Minimize2 size={13} className={running ? 'animate-spin' : undefined} />
        </IconButton>
      }
    >
      <div className="flex min-w-52 flex-col gap-2 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-editorial-muted">
            {t('settings.download.optimizeLongEdge')}
          </span>
          <Select
            value={longEdge !== null ? String(longEdge) : ''}
            onChange={(value) => setLongEdge(Number(value))}
            ariaLabel={t('settings.download.optimizeLongEdge')}
            options={OPTIMIZE_LONG_EDGES.map((value) => ({
              value: String(value),
              label: t('settings.download.pixels', { value }),
            }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-editorial-muted">
            {t('settings.download.optimizeQuality')}
          </span>
          <Select
            value={quality !== null ? String(quality) : ''}
            onChange={(value) => setQuality(Number(value))}
            ariaLabel={t('settings.download.optimizeQuality')}
            options={OPTIMIZE_QUALITIES.map((value) => ({ value: String(value), label: String(value) }))}
          />
        </label>
        <IconButton
          size="sm"
          tone="accent"
          onClick={() => void confirmCompress()}
          disabled={busy || longEdge === null || quality === null}
          title={t('areas.library.optimizeAction')}
        >
          <Check size={14} />
        </IconButton>
      </div>
    </ClickPopover>
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
  if (summary.availability === 'catalogued') return t('areas.library.availabilityRemote');
  if (summary.availability === 'complete') return t('areas.library.availabilityComplete');
  return t('areas.library.availabilityPartial', {
    done: summary.presentPages,
    total: summary.expectedPages,
  });
}
