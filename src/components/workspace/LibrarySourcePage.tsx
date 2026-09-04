import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Check,
  ExternalLink,
  Images,
  Info,
  Library,
  Link2,
  Loader2,
  type LucideIcon,
  MoreVertical,
  NotebookText,
  RefreshCw,
  Tags,
  Trash2,
} from 'lucide-react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import {
  ClickPopover,
  IconButton,
  IconLink,
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
import { confirm } from '../../stores/confirmStore';
import { useSourceActions } from './useSourceActions';
import { CopiesSection } from './CopiesSection';
import { SourceFieldRow } from './SourceFieldRow';
import { MarkdownEditor } from '../common';
import { PageViewer } from '../viewer/PageViewer';
import { useDebounce } from '../../hooks/useDebounce';
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
  onRemoved: () => Promise<void>;
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
  const initialManifestVersion = iiifVersions.find((version) => version.isPrimary) ?? iiifVersions[0];
  const [selectedVersionId, setSelectedVersionId] = useState(initialManifestVersion?.id ?? '');
  const manifestVersion =
    iiifVersions.find((version) => version.id === selectedVersionId) ?? initialManifestVersion;
  const libraryPageUrl = detail.pageUrl ?? detail.catalogUrl;
  const creatorDate = [detail.creator, detail.date].filter(Boolean).join(' · ');
  const [activeTab, setActiveTab] = useState<InspectorTabId>('info');
  const inspectorWidth = useUiStore((state) => state.librarySourceInspectorWidth);
  const setInspectorWidth = useUiStore((state) => state.setLibrarySourceInspectorWidth);
  const [inspectorPanel, setInspectorPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  /**
   * Quale versione locale sta leggendo il visore, quando ce n'è più di una sul
   * computer. Vive qui perché la scelta si fa nella scheda a destra e il
   * risultato si vede nel visore a sinistra.
   */
  const [chosenLocalSize, setChosenLocalSize] = useState<string | null>(null);
  /**
   * Quale versione locale il visore sta **davvero** leggendo, dichiarata da
   * lui. Senza, nessuna riga risultava «in lettura» finché non si sceglieva a
   * mano — nemmeno quando di versioni ce n'era una sola.
   */
  const [readingLocalSize, setReadingLocalSize] = useState<string | null>(null);
  /** La digitalizzazione per cui la scheda è già stata riletta dopo il nuovo
   *  conteggio: una volta basta, senza si rileggerebbe a ogni pagina. */
  const countRefreshedFor = useRef<string | null>(null);
  /** Cresce ogni volta che il visore conserva una pagina: la scheda delle
   *  digitalizzazioni rilegge il deposito senza aspettare un lavoro in coda. */
  const [keptPages, setKeptPages] = useState(0);
  const initialInspectorWidth = useRef(clampWidth(inspectorWidth || 400, INSPECTOR_MIN, INSPECTOR_MAX));

  // Un'altra opera: la posizione di quella precedente non va lasciata a
  // schermo finché il nuovo manifesto non è arrivato.
  useEffect(() => {
    setSelectedVersionId(initialManifestVersion?.id ?? '');
    setChosenLocalSize(null);
    setReadingLocalSize(null);
    countRefreshedFor.current = null;
  }, [detail.source.id, initialManifestVersion?.id]);

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
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-panel">
      {/* Una riga sola: identità dell'opera a sinistra, digitalizzazione al
          centro, comandi a destra. Le due colonne laterali hanno la stessa
          quota, così il centro resta centrato davvero anche con un titolo
          lungo, che si tronca invece di spostarlo. */}
      <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-editorial-border px-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton size="sm" onClick={onBack} title={t('areas.library.backToCatalogue')}>
            <ArrowLeft size={15} />
          </IconButton>
          <BookOpenText size={16} className="shrink-0 text-editorial-accent" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-base italic text-editorial-ink">
              {detail.source.title}
            </h1>
            {creatorDate && (
              <p className="truncate text-xs text-editorial-muted">{creatorDate}</p>
            )}
          </div>
        </div>

        {manifestVersion ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-editorial-muted">
              {t('areas.library.digitalizationLabel')}
            </span>
            {iiifVersions.length > 1 ? (
              <Select
                value={manifestVersion.id}
                onChange={setSelectedVersionId}
                ariaLabel={t('areas.library.digitalizationLabel')}
                options={iiifVersions.map((version) => ({
                  value: version.id,
                  label: version.label,
                }))}
                className="min-w-0 max-w-[14rem]"
              />
            ) : (
              <span className="min-w-0 truncate text-xs text-editorial-ink">
                {providerLabel ?? manifestVersion.label}
              </span>
            )}
            {libraryPageUrl && (
              <IconLink
                size="sm"
                href={libraryPageUrl}
                title={t('areas.library.openOnLibrarySite')}
                tooltipSide="bottom"
              >
                <ExternalLink size={13} />
              </IconLink>
            )}
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-end">
          {entry && (
            <SourceHeaderActions
              entry={entry}
              onRemoved={onRemoved}
              onSetArchived={onSetArchived}
              onRefresh={onRefresh}
            />
          )}
        </div>
      </header>

      <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistLayout}>
      <Panel id="library-source-viewer" minSize={VIEWER_MIN} className="flex min-w-0 flex-col bg-surface-panel">
        {/* Il visore delle pagine nasce come lavoro a sé e verrà riusato anche
            dallo Studio di trascrizione: questo componente resta la stessa
            dimensione minima predisposta prima che esistesse. */}
        {manifestVersion?.sourceUrl ? (
          <PageViewer
            key={manifestVersion.id}
            sourceId={detail.source.id}
            versionId={manifestVersion.id}
            manifestUrl={manifestVersion.sourceUrl}
            providerKey={manifestVersion.providerKey}
            preferredLocalSize={chosenLocalSize}
            onLocalSizeChange={setReadingLocalSize}
            onPageKept={() => setKeptPages((count) => count + 1)}
            onPageChange={(position) => {
              // Il manifesto letto dal visore dice quante pagine ha il libro, e
              // il motore lo registra. La scheda però tiene in mano il numero
              // di prima — a volte «1», dichiarato dalla ricerca — e diceva
              // «1 di 1 · completa» su un libro intero: se il conteggio è
              // cambiato, la si rilegge una volta.
              if (position.total <= 0 || !manifestVersion) return;
              if (manifestVersion.expectedPages === position.total) return;
              if (countRefreshedFor.current === manifestVersion.id) return;
              countRefreshedFor.current = manifestVersion.id;
              onRefresh();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-editorial-muted">
            <span className="flex flex-col items-center gap-2">
              <Images size={28} className="text-editorial-muted/60" aria-hidden="true" />
              {/* Il visore c'è: quello che manca è una digitalizzazione da
                  aprire. Promettere che «arriverà» descriveva l'app di prima. */}
              {t('areas.library.viewerNoManifest')}
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
          panelLabel={t('areas.library.inspectorPanelTitle')}
          collapsed={inspectorCollapsed}
          onCollapsedChange={toggleInspectorCollapsed}
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
                    onCorrectField={onCorrectField}
                    onResyncSource={onResyncSource}
                  />
                  <SourceInfoSection detail={detail} providerLabel={providerLabel} />
                </>
              ) : activeTab === 'copies' ? (
                <CopiesSection
                  detail={detail}
                  entry={entry}
                  onRefresh={onRefresh}
                  openVersionId={manifestVersion?.id ?? null}
                  viewedLocalSize={readingLocalSize}
                  onViewLocalSize={setChosenLocalSize}
                  reloadToken={keptPages}
                />
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
    </div>
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

/** Dati essenziali dell'opera; i metadati meno comuni compaiono soltanto se
 *  presenti e restano raccolti in una sezione chiusa. */
function DataSection({
  detail,
  onCorrectField,
  onResyncSource,
}: {
  detail: LibrarySourceDetail;
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
  const allReadonlyFields: Array<[string, string]> = [
    [t('areas.library.contributorsField'), detail.contributors.join(' · ')],
    [t('areas.library.volumeField'), detail.volume ?? ''],
    [t('areas.library.subjectsField'), detail.subjects.join(' · ')],
    [t('areas.library.publisherField'), detail.publisher ?? ''],
    [t('areas.library.rightsField'), detail.rights.join(' · ')],
    [t('areas.library.physicalDescriptionField'), detail.physicalDescription ?? ''],
    [t('areas.library.originPlaceField'), detail.originPlace ?? ''],
    [t('areas.library.provenanceField'), detail.provenance.join(' · ')],
    [t('areas.library.seriesField'), detail.series ?? ''],
    [t('areas.library.genreFormField'), detail.genreForm.join(' · ')],
    [t('areas.library.standardIdentifierField'), detail.standardIdentifier ?? ''],
    [t('areas.library.coverageField'), detail.coverage.join(' · ')],
    [t('areas.library.relatedWorksField'), detail.relatedWorks.join(' · ')],
  ];
  const readonlyFields = allReadonlyFields.filter(([, value]) => value.trim() !== '');

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
        {detail.description && (
          <StatBlock label={t('areas.library.descriptionField')} value={detail.description} />
        )}
      </dl>
      {readonlyFields.length > 0 && (
        <details className="border-t border-editorial-border/70 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-editorial-muted">
            {t('areas.library.otherMetadata')}
          </summary>
          <dl className="mt-3 space-y-2.5">
            {readonlyFields.map(([label, value]) => (
              <StatBlock key={label} label={label} value={value} />
            ))}
          </dl>
        </details>
      )}
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
  const technicalFields = [
    [t('areas.library.sourceHoldingField'), detail.holdingInstitution ?? ''],
    [t('areas.library.sourcePageUrlField'), detail.pageUrl ?? ''],
    [t('areas.library.sourceCatalogUrlField'), detail.catalogUrl ?? ''],
  ].filter(([, value]) => value !== '');

  return (
    <Section icon={Library} label={t('areas.library.sourceSection')}>
      <dl className="space-y-2.5">
        {providerLabel && (
          <StatBlock label={t('areas.library.sourceProviderField')} value={providerLabel} />
        )}
        {identifier && (
          <StatBlock label={t('areas.library.sourceIdentifierField')} value={identifier} />
        )}
      </dl>
      {technicalFields.length > 0 && (
        <details className="border-t border-editorial-border/70 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-editorial-muted">
            {t('areas.library.technicalData')}
          </summary>
          <dl className="mt-3 space-y-2.5">
            {technicalFields.map(([label, value]) => (
              <StatBlock
                key={label}
                label={label}
                value={value}
                href={value.startsWith('http') ? value : undefined}
              />
            ))}
          </dl>
        </details>
      )}
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
  /** L'ultimo testo **arrivato** al deposito. */
  const savedRef = useRef(notes ?? '');
  /**
   * L'ultimo testo per cui si è provato a salvare, riuscito o no.
   *
   * Sta separato da quello salvato: prima si segnava come salvato il testo
   * appena mandato, e un salvataggio fallito diventava indistinguibile da uno
   * riuscito — nessun tentativo successivo, e uscendo dall'opera la nota si
   * perdeva.
   */
  const attemptRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');

  // Un'altra opera è stata aperta: si riparte dalle sue note, non da quelle
  // lasciate a metà sull'opera precedente.
  useEffect(() => {
    setDraft(notes ?? '');
    savedRef.current = notes ?? '';
    attemptRef.current = null;
    setSaveState('saved');
  }, [sourceId, notes]);

  const save = useCallback(
    async (value: string) => {
      attemptRef.current = value;
      setSaveState('saving');
      try {
        await onCorrectField('notes', value || null);
        savedRef.current = value;
        if (attemptRef.current === value) setSaveState('saved');
      } catch {
        if (attemptRef.current === value) setSaveState('error');
      }
    },
    [onCorrectField],
  );

  useEffect(() => {
    if (debouncedDraft === savedRef.current) return;
    // Un testo già provato non si ritenta da sé: scrivendo si riprova, e
    // sull'errore resta il comando per riprovare quello che c'è.
    if (attemptRef.current === debouncedDraft) return;
    void save(debouncedDraft);
  }, [debouncedDraft, save]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <span
        className={`flex shrink-0 items-center justify-end gap-1 text-xs ${
          saveState === 'error' ? 'text-editorial-danger' : 'text-editorial-muted'
        }`}
        role="status"
      >
        {saveState === 'saving' ? (
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        ) : saveState === 'error' ? (
          <AlertCircle size={12} aria-hidden="true" />
        ) : (
          <Check size={12} aria-hidden="true" />
        )}
        {t(`areas.library.notes${saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : 'SaveError'}`)}
        {saveState === 'error' && (
          <IconButton
            size="xs"
            tone="danger"
            onClick={() => void save(draft)}
            title={t('areas.library.notesRetry')}
          >
            <RefreshCw size={12} />
          </IconButton>
        )}
      </span>
      <MarkdownEditor
        identityKey={sourceId}
        value={draft}
        onChange={setDraft}
        markdownEnabled
        fillHeight
        initialMode="preview"
        placeholder={t('areas.library.notesPlaceholder')}
      />
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
  onRemoved: () => Promise<void>;
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
