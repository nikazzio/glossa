import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { BookOpenText, BookPlus, Check, ChevronDown, FolderPlus, List, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClickPopover, Dialog, IconButton, Select, Spinner } from '../ui';
import { discoverIIIF, listIIIFProviders } from '../../services/iiifProviderService';
import { isManifest, type IIIFProvider, type SourceCard } from '../../types';
import { useUiStore, type DiscoveryResultsPerRow } from '../../stores/uiStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDiscoverySearchStore } from '../../stores/discoverySearchStore';
import { EASE_EDITORIAL } from '../layout/motion';

const READY_DISCOVERY_PROVIDERS = new Set(['generic', 'archive_org']);

const VIEW_OPTIONS: ReadonlyArray<{ value: DiscoveryResultsPerRow; labelKey: string; icon: ReactNode }> = [
  { value: 3, labelKey: 'settings.discoveryResultsThree', icon: <GridGlyph columns={3} /> },
  { value: 4, labelKey: 'settings.discoveryResultsFour', icon: <GridGlyph columns={4} /> },
  { value: 'list', labelKey: 'settings.discoveryResultsList', icon: <List size={14} /> },
];

function sourceTypeLabel(card: SourceCard, providerLabel: string): string {
  const mediaType = !isManifest(card) ? card.mediaType : null;
  return mediaType ? `${providerLabel} · ${mediaType}` : providerLabel;
}


/** Scarta i doppioni tenendo il primo arrivato: l'ordine dei risultati è del
 * catalogo, e riordinarlo per deduplicare cambierebbe quello che l'utente
 * vede. */
function dedupeById<T extends { id: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

/** Riordina la lista SOLO per la visualizzazione (chiavi card.id restano stabili,
 * Framer Motion anima lo spostamento, nessun remount): la scheda espansa tiene con
 * sé SOLO la prima scheda della sua riga originale (1 unità + `columns-1` unità
 * dell'espansa = riga sempre piena, mai a metà). Le schede rimaste in mezzo fra
 * le due passano dopo, subito dopo questa riga — mai indietro. Richiudendo,
 * torna l'ordine originale. */
function reorderForExpansion<T extends { id: string }>(cards: T[], columns: number, expandedId: string | null): T[] {
  if (!expandedId) return cards;
  const idx = cards.findIndex((card) => card.id === expandedId);
  if (idx === -1) return cards;
  const chunkStart = Math.floor(idx / columns) * columns;
  if (idx === chunkStart) return cards; // già prima della riga, niente da spostare

  const before = cards.slice(0, chunkStart);
  const keptRow = [cards[chunkStart], cards[idx]];
  const between = cards.slice(chunkStart + 1, idx); // fra il primo e l'espansa: passa dopo
  const restAfterIdx = cards.slice(idx + 1); // dopo l'espansa: prosegue invariato
  return [...before, ...keptRow, ...between, ...restAfterIdx];
}

const CARD_GAP_REM = 0.75;

/** Larghezza fissa per scheda: mai a `flex-grow`, altrimenti le righe incomplete
 * (fine risultati o riga di scarto) stirano le schede oltre la dimensione delle altre. */
function cardWidth(isExpandedCard: boolean, columns: number): string {
  const unit = `((100% - ${(columns - 1) * CARD_GAP_REM}rem) / ${columns})`;
  if (!isExpandedCard) return `calc(${unit})`;
  return `calc(${unit} * ${columns - 1} + ${(columns - 2) * CARD_GAP_REM}rem)`;
}

interface CardActionsProps {
  adding: boolean;
  alreadyAdded: boolean;
  onAddToLibrary: () => void;
  onAddToWorkspace: () => void;
}

function CardActions({ adding, alreadyAdded, onAddToLibrary, onAddToWorkspace }: CardActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton
        title={alreadyAdded ? t('dashboard.discovery.alreadyInLibrary') : t('dashboard.discovery.addToLibrary')}
        onClick={onAddToLibrary}
        disabled={adding || alreadyAdded}
        size="sm"
        tone={alreadyAdded ? 'success' : 'default'}
      >
        {adding ? <Spinner size={14} /> : alreadyAdded ? <Check size={14} /> : <BookPlus size={14} />}
      </IconButton>
      <IconButton
        title={t('dashboard.discovery.addToWorkspace')}
        onClick={onAddToWorkspace}
        disabled={adding}
        size="sm"
      >
        <FolderPlus size={14} />
      </IconButton>
    </div>
  );
}

interface CardViewProps {
  card: SourceCard;
  providerLabel: string;
  expanded: boolean;
  width: string;
  onToggle: () => void;
  onAddToLibrary: () => void;
  onAddToWorkspace: () => void;
  adding: boolean;
  alreadyAdded: boolean;
}

/** Riga compatta label/valore per la griglia dati della scheda espansa (stesso
 * schema di StatRow: label sans piccola, valore serif) — senza StatRow diretto
 * perché qui il valore può troncare (`truncate`), StatRow non lo prevede.
 * Solo `span`: la griglia vive dentro il `button` di espansione della scheda,
 * che ammette esclusivamente phrasing content — `dl`/`dt`/`dd` (come `div` o
 * `p`) sono flow content e renderebbero il markup non valido. */
function DataStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="w-24 shrink-0 whitespace-nowrap text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{label}</span>
      <span className="min-w-0 truncate font-display text-sm italic text-editorial-ink">{value}</span>
    </span>
  );
}

function SourceCardView({ card, providerLabel, expanded, width, onToggle, onAddToLibrary, onAddToWorkspace, adding, alreadyAdded }: CardViewProps) {
  const { t } = useTranslation();
  const title = card.title || t('dashboard.discovery.untitled');
  const metaLine = [
    card.creator ? `${t('dashboard.discovery.by')} ${card.creator}` : null,
    card.date,
    card.volume,
  ].filter(Boolean).join(' · ');

  const stats: Array<[string, string]> = [
    card.creator && [t('dashboard.discovery.by'), card.creator],
    card.date && [t('dashboard.discovery.published'), card.date],
    card.language && [t('dashboard.discovery.language'), card.language],
    card.volume && [t('dashboard.discovery.volume'), card.volume],
    !isManifest(card) && card.mediaType && [t('dashboard.discovery.type'), card.mediaType],
    isManifest(card) && card.materialType && [t('dashboard.discovery.type'), card.materialType],
    !isManifest(card) && card.collection && [t('dashboard.discovery.collection'), card.collection],
    isManifest(card) && card.itemCount !== null && [t('dashboard.discovery.pages'), String(card.itemCount)],
    card.subjects.length > 0 && [t('dashboard.discovery.subjects'), card.subjects.join(' · ')],
  ].filter((entry): entry is [string, string] => Boolean(entry));

  return (
    <motion.article
      layout
      style={{ flex: `0 0 ${width}`, minWidth: 0 }}
      transition={{ duration: 0.28, ease: EASE_EDITORIAL }}
      className={`overflow-hidden rounded-[20px] border bg-surface-elevated text-left transition-colors ${
        expanded ? 'border-editorial-accent/55' : 'border-editorial-border hover:border-editorial-accent/45'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-editorial-border/70 px-3 py-1.5">
        <span className="truncate text-[11px] uppercase tracking-[0.1em] text-editorial-muted">{providerLabel}</span>
        <CardActions adding={adding} alreadyAdded={alreadyAdded} onAddToLibrary={onAddToLibrary} onAddToWorkspace={onAddToWorkspace} />
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={`flex w-full gap-4 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          expanded ? 'min-h-40 flex-col' : 'h-40'
        }`}
      >
        <span
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-editorial-border bg-editorial-textbox ${
            expanded ? 'h-40 w-28 self-start' : 'h-full w-28'
          }`}
        >
          {card.thumbnailUrl ? <img src={card.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <BookOpenText size={24} className="text-editorial-muted" aria-hidden="true" />}
        </span>
        {expanded ? (
          // A tre o quattro colonne non c'è larghezza per mettere i dati
          // accanto al titolo: affiancarli taglia gli uni e gli altri. La
          // scheda cresce in altezza e i dati vanno sotto. (In vista elenco la
          // scheda è un'altra, e lì lo spazio c'è.)
          <span className="mt-3 flex min-w-0 flex-1 flex-col gap-3">
            <span className="flex min-w-0 flex-col overflow-hidden">
              <span className="block font-display text-lg italic leading-tight text-editorial-ink">{title}</span>
              {card.description && <span className="mt-1.5 block line-clamp-2 text-xs leading-relaxed text-editorial-ink/70">{card.description}</span>}
            </span>
            <span
              className="grid min-w-0 flex-1 auto-rows-min grid-cols-1 content-start gap-x-4 gap-y-1 overflow-hidden" 
            >
              {stats.map(([label, value]) => <DataStat key={label} label={label} value={value} />)}
            </span>
          </span>
        ) : (
          <span className="min-w-0 overflow-hidden">
            <span className="block line-clamp-2 font-display text-lg italic leading-tight text-editorial-ink">{title}</span>
            {metaLine && <span className="mt-2 block line-clamp-1 text-xs text-editorial-muted">{metaLine}</span>}
          </span>
        )}
      </button>
    </motion.article>
  );
}

function SourceListRow({ card, providerLabel, expanded, onToggle, onAddToLibrary, onAddToWorkspace, adding, alreadyAdded }: Omit<CardViewProps, 'width'>) {
  const { t } = useTranslation();
  const title = card.title || t('dashboard.discovery.untitled');

  return (
    <motion.article layout transition={{ duration: 0.28, ease: EASE_EDITORIAL }} className="border-b border-editorial-border/70">
      <div className={`flex gap-3 py-2.5 ${expanded ? 'items-start' : 'items-center'}`}>
        <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex min-w-0 flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
          {expanded ? (
            <>
              <span className="font-display italic text-editorial-ink">{title}</span>
              <span className="mt-0.5 text-xs text-editorial-muted">
                {card.creator && <>{card.creator} · </>}
                {card.date && <>{card.date} · </>}
                {sourceTypeLabel(card, providerLabel)}
              </span>
            </>
          ) : (
            <span className="flex min-w-0 items-center gap-3">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-display italic text-editorial-ink">{title}</span>
                {card.creator && <span className="text-editorial-charcoal"> — {card.creator}</span>}
              </span>
              {card.date && <span className="shrink-0 text-xs text-editorial-muted">{card.date}</span>}
              <span className="hidden shrink-0 text-xs text-editorial-muted sm:inline">{sourceTypeLabel(card, providerLabel)}</span>
            </span>
          )}
        </button>
        <CardActions adding={adding} alreadyAdded={alreadyAdded} onAddToLibrary={onAddToLibrary} onAddToWorkspace={onAddToWorkspace} />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="pb-3 pl-1 pr-3">
              {card.description && <p className="text-sm leading-relaxed text-editorial-ink/80">{card.description}</p>}
              {card.subjects.length > 0 && <p className="mt-2 text-xs leading-relaxed text-editorial-muted"><span className="text-editorial-ink">{t('dashboard.discovery.subjects')}:</span> {card.subjects.join(' · ')}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function SourceDiscoveryPanel() {
  const { t } = useTranslation();
  const resultsPerRow = useUiStore((state) => state.discoveryResultsPerRow);
  const setResultsPerRow = useUiStore((state) => state.setDiscoveryResultsPerRow);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const providerKey = useDiscoverySearchStore((state) => state.providerKey);
  const setProviderKey = useDiscoverySearchStore((state) => state.setProviderKey);
  const input = useDiscoverySearchStore((state) => state.input);
  const setInput = useDiscoverySearchStore((state) => state.setInput);
  const outcome = useDiscoverySearchStore((state) => state.outcome);
  const setOutcome = useDiscoverySearchStore((state) => state.setOutcome);
  const page = useDiscoverySearchStore((state) => state.page);
  const setPage = useDiscoverySearchStore((state) => state.setPage);
  const expandedId = useDiscoverySearchStore((state) => state.expandedId);
  const setExpandedId = useDiscoverySearchStore((state) => state.setExpandedId);
  const searchError = useDiscoverySearchStore((state) => state.searchError);
  const setSearchError = useDiscoverySearchStore((state) => state.setSearchError);
  const [showLayoutOptions, setShowLayoutOptions] = useState(false);
  const [workspacePickerCard, setWorkspacePickerCard] = useState<SourceCard | null>(null);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const addingUrls = useSourceLibraryStore((state) => state.addingUrls);
  const addedManifestUrls = useSourceLibraryStore((state) => state.addedManifestUrls);
  const libraryManifestUrls = useSourceLibraryStore((state) => state.libraryManifestUrls);
  const addFromDiscovery = useSourceLibraryStore((state) => state.addFromDiscovery);
  const loadLibraryManifestUrls = useSourceLibraryStore((state) => state.loadLibraryManifestUrls);
  const libraryError = useSourceLibraryStore((state) => state.error);
  const clearLibraryError = useSourceLibraryStore((state) => state.clearError);

  const isAlreadyInLibrary = (manifestUrl: string) =>
    addedManifestUrls.has(manifestUrl) || libraryManifestUrls.has(manifestUrl);

  useEffect(() => {
    if (!libraryError) return;
    toast.error(t('dashboard.discovery.addToLibraryFailed'));
    clearLibraryError();
  }, [libraryError, clearLibraryError, t]);

  useEffect(() => {
    void loadLibraryManifestUrls();
  }, [loadLibraryManifestUrls]);

  useEffect(() => {
    listIIIFProviders()
      .then((items) => {
        const ready = items.filter((provider) => READY_DISCOVERY_PROVIDERS.has(provider.key));
        setProviders(ready);
        const current = useDiscoverySearchStore.getState().providerKey;
        if (!ready.some((provider) => provider.key === current) && ready[0]) setProviderKey(ready[0].key);
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedProvider = providers.find((provider) => provider.key === providerKey);
  const cards = useMemo<SourceCard[]>(() => {
    if (!outcome) return [];
    return outcome.manifest ? [{ ...outcome.manifest, id: outcome.manifest.manifestUrl }] : outcome.results;
  }, [outcome]);
  const isListView = resultsPerRow === 'list';
  const columns = resultsPerRow === 4 ? 4 : 3;
  const displayCards = useMemo(
    () => isListView ? cards : reorderForExpansion(cards, columns, expandedId),
    [cards, isListView, columns, expandedId],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    setSearching(true);
    setExpandedId(null);
    setPage(1);
    setOutcome(null);
    setSearchError(false);
    try {
      setOutcome(await discoverIIIF(providerKey, input.trim(), 1));
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const loadMore = async () => {
    if (!outcome || searching) return;
    const nextPage = page + 1;
    setSearching(true);
    setSearchError(false);
    try {
      const next = await discoverIIIF(providerKey, input.trim(), nextPage);
      // Alcuni cataloghi — Internet Archive fra questi — restituiscono lo
      // stesso identificativo su due pagine diverse. Concatenare e basta
      // produce schede doppie con la stessa chiave.
      setOutcome(outcome ? { ...next, results: dedupeById([...outcome.results, ...next.results]) } : next);
      setPage(nextPage);
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <form className="flex shrink-0 items-center gap-2 border-y border-editorial-border py-3" onSubmit={submit}>
        <Select value={providerKey} onChange={(value) => { setProviderKey(value); setOutcome(null); }} options={providers.map((provider) => ({ value: provider.key, label: provider.label }))} ariaLabel={t('dashboard.discovery.source')} disabled={loading || providers.length === 0} />
        <input value={input} onChange={(event) => setInput(event.target.value)} aria-label={t('dashboard.discovery.input')} placeholder={selectedProvider?.placeholder ?? t('dashboard.discovery.input')} className="min-w-0 flex-1 bg-transparent px-2 py-2 font-display text-xl italic text-editorial-ink outline-none placeholder:text-editorial-muted/70 focus-visible:ring-2 focus-visible:ring-editorial-accent" />
        <IconButton title={t('dashboard.discovery.submit')} type="submit" disabled={loading || searching || !input.trim()}>
          {searching ? <Spinner size={16} /> : <Search size={16} />}
        </IconButton>
        <ClickPopover
          open={showLayoutOptions}
          onOpenChange={setShowLayoutOptions}
          align="end"
          trigger={
            <IconButton
              title={t('dashboard.discovery.viewOptions')}
              ariaPressed={showLayoutOptions}
            >
              {resultsPerRow === 'list' ? <List size={16} /> : <GridGlyph columns={resultsPerRow} />}
            </IconButton>
          }
        >
          <div role="radiogroup" aria-label={t('dashboard.discovery.viewOptions')}>
            {VIEW_OPTIONS.map(({ value, labelKey, icon }) => {
              const isActive = resultsPerRow === value;
              return (
                <button
                  key={value}
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => { setResultsPerRow(value); setShowLayoutOptions(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-editorial-textbox/60 ${
                    isActive ? 'font-medium text-editorial-ink' : 'text-editorial-muted'
                  }`}
                >
                  <span className={`flex shrink-0 items-center justify-center ${isActive ? 'text-editorial-accent' : 'text-editorial-muted'}`}>{icon}</span>
                  <span className="flex-1 truncate">{t(labelKey)}</span>
                  {isActive && <Check size={14} className="shrink-0 text-editorial-accent" />}
                </button>
              );
            })}
          </div>
        </ClickPopover>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
      {searching && !outcome && (
        <div className="flex min-h-64 items-center justify-center" role="status">
          <motion.div
            animate={{ opacity: [0.45, 1, 0.45], scale: [0.92, 1, 0.92] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Spinner size={38} className="text-editorial-accent" />
          </motion.div>
        </div>
      )}
      {outcome?.status === 'not_found' && <p className="mt-4 text-sm text-editorial-muted">{t('dashboard.discovery.notFound')}</p>}
      {searchError && <p className="mt-4 text-sm text-editorial-danger" role="alert">{t('dashboard.discovery.searchFailed')}</p>}
      {cards.length > 0 && (
        <LayoutGroup>
          {isListView ? (
            <div className="mt-4">
              {cards.map((card) => (
                <SourceListRow
                  key={card.id}
                  card={card}
                  providerLabel={selectedProvider?.label ?? ''}
                  expanded={expandedId === card.id}
                  onToggle={() => setExpandedId((current) => current === card.id ? null : card.id)}
                  onAddToLibrary={() => void addFromDiscovery(card)}
                  onAddToWorkspace={() => setWorkspacePickerCard(card)}
                  adding={addingUrls.has(card.manifestUrl)}
                  alreadyAdded={isAlreadyInLibrary(card.manifestUrl)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-start gap-3">
              {displayCards.map((card) => (
                <SourceCardView
                  key={card.id}
                  card={card}
                  providerLabel={selectedProvider?.label ?? ''}
                  expanded={expandedId === card.id}
                  width={cardWidth(expandedId === card.id, columns)}
                  onToggle={() => setExpandedId((current) => current === card.id ? null : card.id)}
                  onAddToLibrary={() => void addFromDiscovery(card)}
                  onAddToWorkspace={() => setWorkspacePickerCard(card)}
                  adding={addingUrls.has(card.manifestUrl)}
                  alreadyAdded={isAlreadyInLibrary(card.manifestUrl)}
                />
              ))}
            </div>
          )}
        </LayoutGroup>
      )}
      {outcome?.hasMore && (
        <div className="mt-4 flex justify-center">
          <IconButton title={t('dashboard.discovery.loadMore')} onClick={() => void loadMore()} disabled={searching}>
            {searching ? <Spinner size={16} className="text-editorial-muted" /> : <ChevronDown size={16} />}
          </IconButton>
        </div>
      )}
      </div>
      <Dialog
        open={workspacePickerCard !== null}
        onOpenChange={(open) => { if (!open) setWorkspacePickerCard(null); }}
        title={t('dashboard.discovery.addToWorkspace')}
        eyebrow={t('dashboard.title')}
        closeLabel={t('common.close')}
      >
        <div className="space-y-3">
          {workspaces.length === 0 ? (
            <p className="py-4 text-center text-sm italic text-editorial-muted">
              {t('dashboard.discovery.noWorkspaces')}
            </p>
          ) : (
            <div className="max-h-64 divide-y divide-editorial-border/70 overflow-y-auto">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => {
                    if (workspacePickerCard) void addFromDiscovery(workspacePickerCard, workspace.id);
                    setWorkspacePickerCard(null);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <span className="truncate font-display text-base italic text-editorial-ink">{workspace.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </section>
  );
}

function GridGlyph({ columns }: { columns: 3 | 4 }) {
  const cells = columns === 3 ? 6 : 8;
  return (
    <span aria-hidden="true" className={`grid h-3 w-3 gap-px ${columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
      {Array.from({ length: cells }, (_, index) => <span key={index} className="rounded-[1px] bg-current" />)}
    </span>
  );
}
