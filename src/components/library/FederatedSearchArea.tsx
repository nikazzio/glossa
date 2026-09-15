import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Activity, ArrowDown, ArrowUpDown, CheckCircle2, EyeOff, FilePlus, Globe, HelpCircle, History, Layers, RefreshCw, Search, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProviderSiteLink } from './ProviderSiteLink';
import { toast } from 'sonner';
import { useFederatedSearch } from '../../hooks/useFederatedSearch';
import { EMPTY_SEARCH, createSearch, currentExecutions, groupResults, occurrenceKey, searchResults, searchStatus, type SearchCriteria, type SearchResultGroup, type SearchResultPage } from '../../services/federatedSearchService';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { getLibrarySourceDetail } from '../../services/libraryService';
import { useFederatedSearchStore } from '../../stores/federatedSearchStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { dashboardLocation } from '../../navigation/appLocation';
import type { IIIFProvider } from '../../types';
import { formatDateTime } from '../../utils';
import { Dialog, EmptyState, Hint, IconButton, InspectorShell, PopoverItem, Select, Spinner } from '../ui';
import { SEARCH_ERRORS, SourceListRow } from '../dashboard/SourceDiscoveryPanel';
import { SearchCriteriaPanel } from './SearchCriteriaPanel';
import { SearchExecutionPanel } from './SearchExecutionPanel';
import { logger } from '../../utils/logger';

/** I filtri sono comandi icona: il nome e il significato stanno nel suggerimento. */
const VISIBILITY_FILTERS = [
  { value: 'all', icon: Layers },
  { value: 'match', icon: CheckCircle2 },
  { value: 'unknown', icon: HelpCircle },
  { value: 'excluded', icon: EyeOff },
] as const;

export function FederatedSearchArea({ searchId }: { searchId?: string }) {
  const { t } = useTranslation();
  const { runs, selected, pages, error, loading, refresh, hasMore, loadMore } = useFederatedSearch(searchId);
  const navigate = useUiStore((s) => s.navigate);
  const draft = useFederatedSearchStore();
  const library = useSourceLibraryStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);
  const [tab, setTab] = useState('execution');
  // Le parole cercate stanno nella barra; il resto dei criteri dietro un comando.
  const [keywords, setKeywords] = useState('');
    const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // La copia scelta si ricorda per identità: le occorrenze si ricostruiscono
  // a ogni pagina che arriva, e una posizione punterebbe a un'altra biblioteca.
  const [occurrenceChoice, setOccurrenceChoice] = useState<Record<string,string>>({});
  const [visibility, setVisibility] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [byTitle, setByTitle] = useState(false);
  const [picker, setPicker] = useState<SearchResultGroup | null>(null);
  const [historical, setHistorical] = useState<{searchId:string;executionId:string;pages:SearchResultPage[]} | null>(null);
  const [linked, setLinked] = useState<string[] | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  // The request ID survives a lost response, making resubmission idempotent.
  const pending = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    let disposed = false;
    void listIIIFProviders().then((list) => {
      if (disposed) return;
      setProviders(list);
      const store = useFederatedSearchStore.getState();
      if (store.providers === null) store.setProviders(list.filter((p) => p.kind === 'library' && p.supportsSearch).map((p) => p.key));
      else store.setProviders(store.providers.filter((key) => list.some((p) => p.key === key && p.supportsSearch)));
    }).catch(() => { if (!disposed) toast.error(t('federation.providersFailed')); });
    void useSourceLibraryStore.getState().loadLibraryManifestUrls();
    return () => { disposed = true; };
  }, [t]);
  useEffect(() => { setByTitle(false); setExpanded(null); setProviderFilter('all'); setHistorical(null); }, [searchId]);
  useEffect(() => { setKeywords(selected?.criteria.query ?? draft.criteria.query); }, [selected?.criteria.query, draft.criteria.query]);
  useEffect(() => {
    if (library.error) { toast.error(t('dashboard.discovery.addToLibraryFailed')); useSourceLibraryStore.getState().clearError(); }
  }, [library.error, library.clearError, t]);
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
    const chosen = extension && selected
      ? (draft.providers ?? []).filter((key) => providers.some((p) => p.key === key && p.kind === 'aggregator') && !selected.providers.includes(key))
      : draft.providers ?? [];
    const request = { criteria, providers: chosen, derivedFromId: extension ? selected?.id ?? null : null };
    const signature = JSON.stringify(request);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    const run = await createSearch({ ...request, id: pending.current.id });
    logger.info('federation.search.created', { searchId: run.id, providers: chosen.length, extension, derivedFromId: request.derivedFromId });
    pending.current = null;
    navigate(dashboardLocation({ view: 'search', searchId: run.id }));
    setTab('execution');
  });
  /** Nuova ricerca: si torna al foglio bianco, senza perdere le fonti scelte. */
  const startNew = () => {
    setKeywords('');
    draft.setCriteria(EMPTY_SEARCH);
    setHistorical(null);
    setTab('execution');
    navigate(dashboardLocation({ view: 'search' }));
  };
  const resultPages = historical && historical.searchId === searchId ? historical.pages : pages;
  const providerLabels = useMemo(() => new Map(providers.map((provider) => [provider.key, provider.label])), [providers]);
  const label = (key: string) => providerLabels.get(key) ?? key;
  const groups = useMemo(() => selected ? groupResults(resultPages.filter((page) => providerFilter === 'all' || page.providerKey === providerFilter), selected.criteria) : [], [resultPages, selected, providerFilter]);
  const ordered = useMemo(() => byTitle
    ? [...groups].sort((a, b) => a.card.title.localeCompare(b.card.title))
    : groups, [groups, byTitle]);
  const visible = useMemo(() => ordered.filter((g) =>
    (visibility === 'all' ? g.match !== 'excluded' : g.match === visibility) &&
    (providerFilter === 'all' || g.origins.includes(providerFilter))), [ordered, visibility, providerFilter]);
  // Quattro conteggi su migliaia di risultati: si rifanno quando arrivano
  // pagine nuove, non a ogni disegno della schermata.
  const summary = useMemo(() => ({
    received: resultPages.reduce((sum, page) => sum + page.results.length, 0),
    unique: groups.length,
    visible: visible.length,
    complete: selected ? currentExecutions(selected).filter((e) => e.job.status === 'completed').length : 0,
    total: selected?.providers.length ?? 0,
    unknown: groups.filter((group) => group.match === 'unknown').length,
  }), [resultPages, groups, visible, selected]);
  // Chi guarda i risultati deve sapere che una biblioteca non ha risposto:
  // altrimenti «dodici risultati» si legge come «tutto quello che c'è».
  const failed = useMemo(() => selected
    ? currentExecutions(selected).filter((execution) => execution.job.status === 'error')
    : [], [selected]);
  const virtualizer = useVirtualizer({ count: visible.length, getScrollElement: () => scroll.current,
    estimateSize: () => 72, getItemKey: (index) => visible[index].id, overscan: 5 });
  const tabs = [
    { id: 'execution', label: selected ? `${t('federation.execution')} · ${summary.complete}/${summary.total}` : t('federation.execution'), icon: <Activity size={16} /> },
    { id: 'history', label: t('federation.history'), icon: <History size={16} /> },
    { id: 'criteria', label: t('federation.advanced'), icon: <SlidersHorizontal size={16} /> },
  ];
  const extensionPossible = selected && (draft.providers ?? []).some((key) => !selected.providers.includes(key) && providers.some((p) => p.key === key && p.kind === 'aggregator'));
  return <div className="grid h-full min-h-0 w-full min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
    <section className="flex min-h-96 min-w-0 flex-col lg:min-h-0">
      {/* Si cerca da qui, come nella ricerca per indirizzo: una parola e via.
          I criteri fini stanno dietro un comando, non davanti a tutti. */}
      <form className="flex shrink-0 items-center gap-2 border-b border-editorial-border px-3 py-2"
        onSubmit={(event) => { event.preventDefault(); draft.setCriteria({ ...draft.criteria, query: keywords }); launch(false, { ...draft.criteria, query: keywords }); }}>
        <input value={keywords} onChange={(event) => setKeywords(event.target.value)}
          aria-label={t('federation.fields.query')} placeholder={t('federation.queryPlaceholder')}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 font-display text-xl italic text-editorial-ink outline-none placeholder:text-editorial-muted/70 focus-visible:ring-2 focus-visible:ring-editorial-accent" />
        <IconButton type="submit" title={t('federation.launch')} disabled={busy || !keywords.trim() || !(draft.providers ?? []).length}>
          {busy ? <Spinner size={16} /> : <Search size={16} />}
        </IconButton>
        <IconButton title={t('federation.advanced')} ariaPressed={tab === 'criteria'}
          tone={tab === 'criteria' ? 'accent' : 'default'}
          onClick={() => setTab(tab === 'criteria' ? 'execution' : 'criteria')}><SlidersHorizontal size={16} /></IconButton>
        <IconButton title={t('federation.new')} onClick={startNew}><FilePlus size={16} /></IconButton>
        <IconButton title={t('federation.extend')} disabled={!extensionPossible || busy} onClick={() => launch(true)}><Globe size={16} /></IconButton>
        <IconButton title={t('federation.refresh')} onClick={refresh} disabled={loading}><RefreshCw size={16} /></IconButton>
      </form>
      {error && <p role="alert" className="p-3 text-sm text-editorial-danger">{t('federation.readFailed')}</p>}
      {!selected && !loading && <EmptyState icon={<Search size={20} />} message={t('federation.empty')} />}
      {loading && !selected && <Spinner size={24} />}
      {selected && <>
        {/* Le parole cercate stanno già nel campo qui sopra: ripeterle qui
            rubava una riga e non aggiungeva niente. */}
        <div className="space-y-2 border-b border-editorial-border p-3">
          {/* Due numeri leggibili, il resto al passaggio del mouse: prima erano
              cinque dati in fila che nessuno decifrava. */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-editorial-muted" role="status" aria-live="polite">
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
            {historical && <span className="text-editorial-warning">{t('federation.historical')}</span>}
          </div>
          {/* Filtri come comandi allineati a destra: una parola ciascuno, il
              significato al passaggio del mouse. */}
          <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label={t('federation.filterLabel')}>
            {historical && <IconButton size="sm" tone="accent" title={t('federation.currentResults')}
              onClick={() => { setHistorical(null); setByTitle(false); }}><Undo2 size={14} /></IconButton>}
            {providerFilter !== 'all' && <IconButton size="sm" tone="accent" title={t('federation.allSources')}
              onClick={() => setProviderFilter('all')}><Globe size={14} /></IconButton>}
            {providerFilter !== 'all' && <ProviderSiteLink
              provider={providers.find((provider) => provider.key === providerFilter)}
              query={selected?.criteria.query} />}
            {VISIBILITY_FILTERS.map(({ value, icon: Icon }) => (
              <IconButton key={value} size="sm" ariaPressed={visibility === value}
                tone={visibility === value ? 'accent' : 'default'}
                title={`${t(`federation.visibility.${value}`)} — ${t(`federation.visibilityHint.${value}`)}`}
                onClick={() => setVisibility(value)}><Icon size={14} /></IconButton>
            ))}
            <IconButton size="sm" title={byTitle ? t('federation.arrivalOrder') : t('federation.sortTitle')} ariaPressed={byTitle}
              tone={byTitle ? 'accent' : 'default'} onClick={() => setByTitle(!byTitle)}><ArrowUpDown size={14} /></IconButton>
          </div>
        </div>
        <div ref={scroll} className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          {/* Nessun risultato è il momento in cui serve uscire: le biblioteche
              interrogate si riaprono sul loro sito, con le stesse parole. */}
          {visible.length === 0 && <div className="flex flex-col items-center gap-3 py-2">
            <EmptyState icon={<Search size={20} />} message={t('federation.noVisible')} />
            <div className="flex flex-wrap items-center justify-center gap-1">
              {/* Con una fonte sola sott'occhio si esce verso quella: offrire
                  anche le altre risponderebbe a una domanda non fatta. */}
              {providers.filter((provider) => (providerFilter === 'all'
                ? selected?.providers.includes(provider.key)
                : provider.key === providerFilter))
                .map((provider) => <ProviderSiteLink key={provider.key} provider={provider}
                  query={selected?.criteria.query} />)}
            </div>
          </div>}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const original = visible[item.index];
              const occurrence = original.occurrences.find((entry) => occurrenceKey(entry) === occurrenceChoice[original.id]);
              const group = occurrence ? {...original,card:occurrence.card,providerKey:occurrence.providerKey} : original;
              return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>

                {expanded === group.id && group.occurrences.length > 1 && <div className="px-3 py-1">
                  <Select ariaLabel={t('federation.occurrence')} value={occurrenceChoice[group.id] ?? ''}
                    onChange={(value) => setOccurrenceChoice((current) => ({...current,[group.id]:value}))}
                    options={[{value:'',label:t('federation.bestOccurrence')},...group.occurrences.map((entry) => ({value:occurrenceKey(entry),label:label(entry.providerKey)}))]} />
                </div>}
                <SourceListRow card={group.card} providerKey={group.providerKey}
                  providerLabel={group.origins.map((key) => label(key)).join(' · ')}
                  note={[
                    group.occurrences.length > 1 ? t('federation.copies', { count: group.occurrences.length }) : null,
                    group.match === 'unknown' ? t('federation.visibility.unknown') : null,
                  ].filter(Boolean).join(' · ') || undefined}
                  expanded={expanded === group.id} onToggle={() => setExpanded(expanded === group.id ? null : group.id)}
                  onAddToLibrary={() => void library.addFromDiscovery(group.card, undefined, group.providerKey)}
                  onAddToWorkspace={() => setPicker(group)} adding={library.addingUrls.has(group.card.manifestUrl)}
                  alreadyAdded={library.addedManifestUrls.has(group.card.manifestUrl) || library.libraryManifestUrls.has(group.card.manifestUrl)} />
              </div>;
            })}
          </div>
        </div>
      </>}
    </section>
    <aside className="flex min-h-0 min-w-0 flex-col border-t border-editorial-border bg-surface-panel lg:border-l lg:border-t-0">
      <InspectorShell ariaLabel={t('federation.title')} tabs={tabs} activeTab={tab} onTabChange={setTab}
        actions={<span className="font-display text-sm italic text-editorial-ink">
          <Hint label={t(`federation.tabHint.${tab}`)}>{tabs.find((item) => item.id === tab)?.label}</Hint>
        </span>}>
        {tab === 'criteria' && <SearchCriteriaPanel providers={providers} busy={busy}
          onSubmit={() => launch(false, { ...draft.criteria, query: keywords })} />}
        {tab === 'execution' && (selected ? <SearchExecutionPanel run={selected} providers={providers} busy={busy}
          providerFilter={providerFilter} onProviderFilter={(key) => { setProviderFilter(key); setByTitle(false); }}
          act={(work) => void act(work)} onViewExecution={(executionId) => void act(async () => {
          const previousPages = await searchResults(selected.id,executionId);
          setHistorical({searchId:selected.id,executionId,pages:previousPages}); setByTitle(false);
        })} /> : <p className="p-4 text-sm text-editorial-muted">{t('federation.empty')}</p>)}
        {tab === 'history' && <div className="divide-y divide-editorial-border p-3">
          {runs.map((run) => <div key={run.id} className="flex flex-col py-2">
            <PopoverItem label={`${run.criteria.query} · ${t(`jobs.status.${searchStatus(run)}`)}`}
              onSelect={() => { navigate(dashboardLocation({ view: 'search', searchId: run.id })); setTab('execution'); }} />
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
