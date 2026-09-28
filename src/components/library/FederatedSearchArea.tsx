import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'motion/react';
import { Activity, ArrowDown, FilePlus, Globe, History, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ProviderSiteLink } from './ProviderSiteLink';
import { useFederatedSearch } from '../../hooks/useFederatedSearch';
import { EMPTY_SEARCH, createSearch, currentExecutions, groupResults, occurrenceKey, relaunchSearch, searchStatus, type SearchCriteria, type SearchResultGroup, emptyStreak } from '../../services/federatedSearchService';
import { listIIIFProviders, openWork } from '../../services/iiifProviderService';
import { getLibrarySourceDetail } from '../../services/libraryService';
import { useFederatedSearchStore } from '../../stores/federatedSearchStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { dashboardLocation } from '../../navigation/appLocation';
import type { IIIFProvider, SourceCard } from '../../types';
import { formatDateTime } from '../../utils';
import { RESULT_ORDERS, orderResults, type ResultOrder } from '../../utils/searchResultOrder';
import { matchTerms } from '../../utils/searchMatch';
import { Dialog, EmptyState, Hint, IconButton, InspectorShell, PopoverItem, Select, Spinner } from '../ui';
import { SEARCH_ERRORS, SourceListRow } from './SourceListRow';
import { SearchCriteriaPanel } from './SearchCriteriaPanel';
import { SearchExecutionPanel } from './SearchExecutionPanel';
import { SearchScopeSelect, allLibraries } from './SearchScopeSelect';
import { RecognizedWorks, useRecognitions } from './RecognizedWorks';
import { logger } from '../../utils/logger';
import { EASE_EDITORIAL, MOTION_DURATION, MOTION_SHIFT } from '../layout/motion';

/** La riga della casella e quella delle schede a destra sono una linea sola. */
const HEADER_ROW_HEIGHT = 'h-14';

/**
 * Quante pagine vuote di fila si chiedono da sole a una biblioteca. Una pagina
 * può arrivare vuota dopo i filtri (e-codices tiene solo i risultati con
 * tutte le parole) anche se dopo ce ne sono altre; oltre questo limite ci si
 * ferma, e resta il comando «altri risultati».
 */
const AUTO_EMPTY_PAGES = 5;

/** Una pagina chiesta è in viaggio solo in questi stati: in pausa non gira. */
const IN_FLIGHT_STATES: ReadonlySet<string> = new Set(['queued', 'running']);

/** Si può cercare anche solo per campi: basta un testo da mandare. */
function hasSomethingToSend(criteria: SearchCriteria): boolean {
  return [criteria.query, criteria.title, criteria.author, criteria.publisher].some((value) => value.trim() !== '');
}

const isAddress = (text: string) => /^https?:\/\//i.test(text.trim());

/** Un'opera aperta dall'identificativo o dall'indirizzo, fuori dalla ricerca. */
interface OpenedWork {
  providerKey: string;
  card: SourceCard;
}

/**
 * La ricerca, in una schermata sola: una casella, dove cercare accanto, e sopra
 * i risultati la proposta di aprire direttamente l'opera quando quello che si è
 * scritto è un identificativo o un indirizzo.
 */
export function FederatedSearchArea({ searchId }: { searchId?: string }) {
  const { t } = useTranslation();
  const { runs, selected, pages, error, loading, refresh, hasMore, loadMore } = useFederatedSearch(searchId);
  const navigate = useUiStore((s) => s.navigate);
  const draft = useFederatedSearchStore();
  const library = useSourceLibraryStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);
  const [tab, setTab] = useState('sources');
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // La copia scelta si ricorda per identità: le occorrenze si ricostruiscono
  // a ogni pagina che arriva, e una posizione punterebbe a un'altra biblioteca.
  const [occurrenceChoice, setOccurrenceChoice] = useState<Record<string, string>>({});
  const [providerFilter, setProviderFilter] = useState('all');
  const [order, setOrder] = useState<ResultOrder>('arrival');
  const [picker, setPicker] = useState<OpenedWork | null>(null);
  const [linked, setLinked] = useState<string[] | null>(null);
  const [opened, setOpened] = useState<OpenedWork | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const recognitions = useRecognitions(keywords);
  // Il testo di adesso, per scartare un'opera aperta quando il testo era un altro.
  const currentKeywords = useRef(keywords);
  currentKeywords.current = keywords;
  const scroll = useRef<HTMLDivElement>(null);
  // The request ID survives a lost response, making resubmission idempotent.
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const chosen = draft.providers ?? [];

  useEffect(() => {
    let disposed = false;
    void listIIIFProviders().then((list) => {
      if (disposed) return;
      setProviders(list);
      const store = useFederatedSearchStore.getState();
      if (store.providers === null) store.setProviders(allLibraries(list));
      else store.setProviders(store.providers.filter((key) => list.some((p) => p.key === key && p.supportsSearch)));
    }).catch(() => { if (!disposed) toast.error(t('federation.providersFailed')); });
    void useSourceLibraryStore.getState().loadLibraryManifestUrls();
    return () => { disposed = true; };
  }, [t]);
  useEffect(() => { setOrder('arrival'); setExpanded(null); setProviderFilter('all'); }, [searchId]);
  useEffect(() => { setKeywords(selected?.criteria.query ?? draft.criteria.query); }, [selected?.criteria.query, draft.criteria.query]);
  useEffect(() => { setOpened(null); }, [keywords]);
  useEffect(() => {
    if (library.error) { toast.error(t('dashboard.discovery.addToLibraryFailed')); useSourceLibraryStore.getState().clearError(); }
  }, [library.error, t]);
  useEffect(() => {
    let disposed = false;
    setLinked(null);
    if (!picker) return;
    const id = library.libraryManifestSourceIds.get(picker.card.manifestUrl);
    if (!id) { setLinked([]); return; }
    void getLibrarySourceDetail(id).then((detail) => { if (!disposed) setLinked(detail.linkedWorkspaceIds); })
      .catch(() => { if (!disposed) { toast.error(t('dashboard.loadFailed')); setPicker(null); } });
    return () => { disposed = true; };
  }, [picker, library.libraryManifestSourceIds, t]);

  const act = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); refresh(); }
    catch (failure: unknown) {
      const code = String(failure);
      toast.error(t(SEARCH_ERRORS[code] ?? code));
      logger.warn('federation.action.failed', { searchId, code: SEARCH_ERRORS[code] ? code : 'command_failed' });
    } finally { setBusy(false); }
  };
  const launch = (extension = false, override?: SearchCriteria) => void act(async () => {
    const criteria = extension && selected ? selected.criteria : override ?? draft.criteria;
    const providerKeys = extension && selected
      ? chosen.filter((key) => providers.some((p) => p.key === key && p.kind === 'aggregator') && !selected.providers.includes(key))
      : chosen;
    const request = { criteria, providers: providerKeys, derivedFromId: extension ? selected?.id ?? null : null };
    const signature = JSON.stringify(request);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    const run = await createSearch({ ...request, id: pending.current.id });
    logger.info('federation.search.created', { searchId: run.id, providers: providerKeys.length, extension, derivedFromId: request.derivedFromId });
    pending.current = null;
    navigate(dashboardLocation({ view: 'search', searchId: run.id }));
    setTab('sources');
  });
  const openRecognized = async (providerKey: string) => {
    const text = keywords;
    setOpening(providerKey);
    try {
      const manifest = await openWork(providerKey, text.trim());
      if (currentKeywords.current !== text) return;
      setOpened({ providerKey, card: { ...manifest, id: manifest.manifestUrl } });
    } catch (failure: unknown) {
      const code = String(failure);
      toast.error(t(SEARCH_ERRORS[code] ?? code));
    } finally {
      setOpening(null);
    }
  };
  /** Un indirizzo non si cerca: si apre. Le parole partono verso le biblioteche. */
  const submit = () => {
    if (isAddress(keywords) && recognitions.length > 0) {
      void openRecognized(recognitions[0].providerKey);
      return;
    }
    const criteria = { ...draft.criteria, query: keywords };
    draft.setCriteria(criteria);
    launch(false, criteria);
  };
  /** Nuova ricerca: si torna al foglio bianco, senza perdere le fonti scelte. */
  const startNew = () => {
    setKeywords('');
    draft.setCriteria(EMPTY_SEARCH);
    setTab('sources');
    navigate(dashboardLocation({ view: 'search' }));
  };

  const label = (key: string) => providers.find((provider) => provider.key === key)?.label ?? key;
  const remoteFields = useMemo(() => new Map(providers.map((provider) => [provider.key, provider.searchFields])), [providers]);
  const groups = useMemo(() => selected
    ? groupResults(pages.filter((page) => providerFilter === 'all' || page.providerKey === providerFilter), selected.criteria, remoteFields)
    : [], [pages, selected, providerFilter, remoteFields]);
  // Un risultato che i dati dichiarati escludono non si mostra; quello su cui
  // manca il dato per decidere resta, segnato, e il conteggio sopra lo dice.
  const visible = useMemo(() => orderResults(groups.filter((group) =>
    group.match !== 'excluded' && (providerFilter === 'all' || group.origins.includes(providerFilter))), order),
  [groups, providerFilter, order]);
  const executions = useMemo(() => selected ? currentExecutions(selected) : [], [selected]);
  const terms = useMemo(() => selected ? matchTerms(selected.criteria) : [], [selected]);
  // Quattro conteggi su migliaia di risultati: si rifanno quando arrivano
  // pagine nuove, non a ogni disegno della schermata.
  const summary = useMemo(() => ({
    received: pages.reduce((sum, page) => sum + page.results.length, 0),
    unique: groups.length,
    visible: visible.length,
    complete: executions.filter((execution) => execution.job.status === 'completed').length,
    total: selected?.providers.length ?? 0,
    unknown: groups.filter((group) => group.match === 'unknown').length,
  }), [pages, groups, visible, executions, selected]);
  // Chi guarda i risultati deve sapere che una biblioteca non ha risposto:
  // altrimenti «dodici risultati» si legge come «tutto quello che c'è».
  const failed = executions.filter((execution) => execution.job.status === 'error');
  const continuable = executions.filter((execution) => execution.job.status === 'completed' && execution.hasMore);
  // «Altri risultati» resta al suo posto e gira finché le pagine chieste non
  // sono arrivate: sparire appena premuto sembrava un comando fallito.
  const fetchingMore = executions.some((execution) => execution.mode === 'continue' && IN_FLIGHT_STATES.has(execution.job.status));
  // I risultati già mostrati non si rianimano: entra con una dissolvenza solo
  // quello che arriva dopo, a pagina successiva o da una biblioteca più lenta.
  // Una pagina vuota con altre dopo si continua da sola, una volta per
  // esecuzione e fino a AUTO_EMPTY_PAGES di fila.
  const autoContinued = useRef(new Set<string>());
  useEffect(() => { autoContinued.current = new Set(); }, [searchId]);
  useEffect(() => {
    if (!selected) return;
    const due = executions.filter((execution) => execution.job.status === 'completed' && execution.hasMore
      && execution.received === 0 && !autoContinued.current.has(execution.job.id)
      && emptyStreak(selected, execution.providerKey) <= AUTO_EMPTY_PAGES);
    if (due.length === 0) return;
    due.forEach((execution) => autoContinued.current.add(execution.job.id));
    void Promise.all(due.map((execution) => relaunchSearch(selected.id, execution.job.id, 'continue')))
      .then(refresh)
      .catch((failure: unknown) => logger.warn('federation.autoContinue.failed', { searchId: selected.id, reason: String(failure) }));
  }, [executions, selected, refresh]);
  const shownIds = useRef(new Set<string>());
  useEffect(() => { shownIds.current = new Set(); }, [searchId]);
  useEffect(() => { for (const group of visible) shownIds.current.add(group.id); }, [visible]);
  const virtualizer = useVirtualizer({ count: visible.length, getScrollElement: () => scroll.current,
    estimateSize: () => 88, getItemKey: (index) => visible[index].id, overscan: 5 });
  const tabs = [
    { id: 'criteria', label: t('federation.advanced'), icon: <SlidersHorizontal size={16} /> },
    { id: 'sources', label: selected ? `${t('federation.execution')} · ${summary.complete}/${summary.total}` : t('federation.execution'), icon: <Activity size={16} /> },
    { id: 'history', label: t('federation.history'), icon: <History size={16} /> },
  ];
  const extensionPossible = selected && chosen.some((key) => !selected.providers.includes(key) && providers.some((p) => p.key === key && p.kind === 'aggregator'));
  const canSubmit = isAddress(keywords) ? recognitions.length > 0 : hasSomethingToSend({ ...draft.criteria, query: keywords }) && chosen.length > 0;

  const rowFor = (work: OpenedWork, group?: SearchResultGroup) => {
    const id = group?.id ?? work.card.manifestUrl;
    return <SourceListRow card={work.card} providerKey={work.providerKey}
      providerLabel={group ? group.origins.map(label).join(' · ') : label(work.providerKey)}
      note={group ? [
        group.occurrences.length > 1 ? t('federation.copies', { count: group.occurrences.length }) : null,
        group.match === 'unknown' ? t('federation.missingData') : null,
      ].filter(Boolean).join(' · ') || undefined : undefined}
      copyPicker={group && group.occurrences.length > 1 ? <Select ariaLabel={t('federation.occurrence')} className="w-full"
        value={occurrenceChoice[group.id] ?? ''}
        onChange={(value) => setOccurrenceChoice((current) => ({ ...current, [group.id]: value }))}
        options={[{ value: '', label: t('federation.bestOccurrence') }, ...group.occurrences.map((entry) => ({ value: occurrenceKey(entry), label: label(entry.providerKey) }))]} /> : undefined}
      matchTerms={group ? terms : undefined}
      expanded={expanded === id} onToggle={() => setExpanded(expanded === id ? null : id)}
      onAddToLibrary={() => void library.addFromDiscovery(work.card, undefined, work.providerKey)}
      onAddToWorkspace={() => setPicker(work)} adding={library.addingUrls.has(work.card.manifestUrl)}
      alreadyAdded={library.addedManifestUrls.has(work.card.manifestUrl) || library.libraryManifestUrls.has(work.card.manifestUrl)} />;
  };

  return <div className="grid h-full min-h-0 w-full min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
    <section className="flex min-h-96 min-w-0 flex-col lg:min-h-0">
      <form className={`flex ${HEADER_ROW_HEIGHT} shrink-0 items-center gap-2 border-b border-editorial-border px-3`}
        onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <SearchScopeSelect providers={providers} chosen={chosen} onChange={draft.setProviders}
          onCustomize={() => setTab('criteria')} />
        <input value={keywords} onChange={(event) => setKeywords(event.target.value)}
          aria-label={t('federation.fields.query')} placeholder={t('federation.queryPlaceholder')}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 font-display text-xl italic text-editorial-ink outline-none placeholder:text-editorial-muted/70 focus-visible:ring-2 focus-visible:ring-editorial-accent" />
        <IconButton type="submit" title={t('federation.launch')} disabled={busy || !canSubmit}>
          {busy ? <Spinner size={16} /> : <Search size={16} />}
        </IconButton>
        <IconButton title={t('federation.advanced')} ariaPressed={tab === 'criteria'}
          tone={tab === 'criteria' ? 'accent' : 'default'}
          onClick={() => setTab(tab === 'criteria' ? 'sources' : 'criteria')}><SlidersHorizontal size={16} /></IconButton>
        <IconButton title={t('federation.new')} onClick={startNew}><FilePlus size={16} /></IconButton>
        <IconButton title={t('federation.extend')} disabled={!extensionPossible || busy} onClick={() => launch(true)}><Globe size={16} /></IconButton>
        <IconButton title={t('federation.refresh')} onClick={refresh} disabled={loading}><RefreshCw size={16} /></IconButton>
      </form>
      <RecognizedWorks recognitions={recognitions} providers={providers} opening={opening}
        onOpen={(providerKey) => void openRecognized(providerKey)} />
      {opened && <div className="shrink-0 border-b border-editorial-border">{rowFor(opened)}</div>}
      {error && <p role="alert" className="p-3 text-sm text-editorial-danger">{t('federation.readFailed')}</p>}
      {!selected && !loading && !opened && <EmptyState icon={<Search size={20} />} message={t('federation.empty')} />}
      {loading && !selected && <Spinner size={24} />}
      {selected && <>
        <div className="flex flex-wrap items-center gap-3 border-b border-editorial-border px-3 py-2 text-xs text-editorial-muted">
          {/* Due numeri leggibili, il resto al passaggio del mouse. */}
          <span role="status" aria-live="polite" className="flex flex-wrap items-center gap-3">
            <Hint label={t('federation.resultsHint', summary)}>
              <span>{t('federation.resultsShort', { count: summary.visible })}</span>
            </Hint>
            <Hint label={t('federation.sourcesHint', summary)}>
              <span className={summary.complete === summary.total ? 'text-editorial-success' : undefined}>
                {t('federation.sourcesShort', summary)}
              </span>
            </Hint>
            {summary.unknown > 0 && <Hint label={t('federation.unknownHint')}>
              <span className="text-editorial-warning">{t('federation.unknownShort', { count: summary.unknown })}</span>
            </Hint>}
            {failed.length > 0 && <Hint label={`${t('federation.failedHint')} — ${failed.map((execution) => label(execution.providerKey)).join(' · ')}`}>
              <span className="text-editorial-danger">{t('federation.failedSources', { count: failed.length })}</span>
            </Hint>}
          </span>
          <span className="ml-auto flex items-center gap-1" role="group" aria-label={t('federation.filterLabel')}>
            {providerFilter !== 'all' && <IconButton size="sm" tone="accent" title={t('federation.allSources')}
              onClick={() => setProviderFilter('all')}><Globe size={14} /></IconButton>}
            {providerFilter !== 'all' && <ProviderSiteLink
              provider={providers.find((provider) => provider.key === providerFilter)}
              query={selected.criteria.query} />}
            <Select ariaLabel={t('federation.order.label')} value={order}
              onChange={(value) => setOrder(value as ResultOrder)}
              options={RESULT_ORDERS.map((value) => ({ value, label: t(`federation.order.${value}`) }))} />
          </span>
        </div>
        <div ref={scroll} className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          {/* Nessun risultato è il momento in cui serve uscire: le biblioteche
              interrogate si riaprono sul loro sito, con le stesse parole. */}
          {visible.length === 0 && <div className="flex flex-col items-center gap-3 py-2">
            <EmptyState icon={<Search size={20} />} message={t('federation.noVisible')} />
            <div className="flex flex-wrap items-center justify-center gap-1">
              {providers.filter((provider) => (providerFilter === 'all'
                ? selected.providers.includes(provider.key)
                : provider.key === providerFilter))
                .map((provider) => <ProviderSiteLink key={provider.key} provider={provider}
                  query={selected.criteria.query} />)}
            </div>
          </div>}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const group = visible[item.index];
              const occurrence = group.occurrences.find((entry) => occurrenceKey(entry) === occurrenceChoice[group.id]);
              const work = occurrence ?? { card: group.card, providerKey: group.providerKey };
              const arriving = shownIds.current.size > 0 && !shownIds.current.has(group.id);
              return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>
                <motion.div initial={arriving ? { opacity: 0, y: MOTION_SHIFT } : false} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: MOTION_DURATION, ease: EASE_EDITORIAL }}>
                  {rowFor(work, group)}
                </motion.div>
              </div>;
            })}
          </div>
          {(continuable.length > 0 || fetchingMore) && <div className="flex justify-center py-3">
            <IconButton title={fetchingMore && continuable.length === 0 ? t('federation.loadingMore') : t('dashboard.discovery.loadMore')}
              disabled={busy || continuable.length === 0}
              onClick={() => void act(() => Promise.all(continuable.map((execution) => relaunchSearch(selected.id, execution.job.id, 'continue'))))}>
              {busy || (fetchingMore && continuable.length === 0) ? <Spinner size={16} /> : <ArrowDown size={16} />}
            </IconButton>
          </div>}
        </div>
      </>}
    </section>
    <aside className="flex min-h-0 min-w-0 flex-col border-t border-editorial-border bg-surface-panel lg:border-l lg:border-t-0">
      <InspectorShell ariaLabel={t('federation.title')} tabs={tabs} activeTab={tab} onTabChange={setTab}
        tabRowHeightClassName={HEADER_ROW_HEIGHT}
        actions={<span className="font-display text-sm italic text-editorial-ink">
          <Hint label={t(`federation.tabHint.${tab}`)}>{tabs.find((item) => item.id === tab)?.label}</Hint>
        </span>}>
        {tab === 'criteria' && <SearchCriteriaPanel providers={providers} busy={busy}
          onSubmit={() => launch(false, { ...draft.criteria, query: keywords })} />}
        {tab === 'sources' && (selected ? <SearchExecutionPanel run={selected} providers={providers} busy={busy}
          providerFilter={providerFilter} onProviderFilter={setProviderFilter}
          act={(work) => void act(work)} /> : <p className="p-4 text-sm text-editorial-muted">{t('federation.empty')}</p>)}
        {tab === 'history' && <div className="divide-y divide-editorial-border p-3">
          {runs.map((run) => <div key={run.id} className="flex flex-col py-2">
            <PopoverItem label={`${run.criteria.query || [run.criteria.title, run.criteria.author].filter(Boolean).join(' · ')} · ${t(`jobs.status.${searchStatus(run)}`)}`}
              onSelect={() => { navigate(dashboardLocation({ view: 'search', searchId: run.id })); setTab('sources'); }} />
            <span className="px-3 text-xs text-editorial-muted">{formatDateTime(run.createdAt)} · {t('federation.selectedCount', { count: run.providers.length })}</span>
          </div>)}
          {hasMore && <IconButton title={t('dashboard.discovery.loadMore')} disabled={loading} onClick={loadMore}><ArrowDown size={16} /></IconButton>}
        </div>}
      </InspectorShell>
    </aside>
    <Dialog open={picker !== null} onOpenChange={(open) => { if (!open) setPicker(null); }} title={t('dashboard.discovery.addToWorkspace')} closeLabel={t('common.close')}>
      {!workspaces.length && <p className="text-sm text-editorial-muted">{t('dashboard.discovery.noWorkspaces')}</p>}
      {workspaces.map((workspace) => <div key={workspace.id} className="flex">
        <PopoverItem label={workspace.name} disabled={linked === null || linked.includes(workspace.id)} onSelect={() => {
          if (picker) void library.addFromDiscovery(picker.card, workspace.id, picker.providerKey);
          setPicker(null);
        }} />
      </div>)}
    </Dialog>
  </div>;
}
