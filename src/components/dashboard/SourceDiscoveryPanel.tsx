import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { BookOpenText, BookPlus, Check, ChevronDown, FolderPlus, List, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClickPopover, Dialog, IconButton, Select, Spinner } from '../ui';
import { discoverIIIF, listIIIFProviders } from '../../services/iiifProviderService';
import type { IIIFDiscoveryResult, IIIFManifestPreview, IIIFProvider } from '../../types';
import { useUiStore, type DiscoveryResultsPerRow } from '../../stores/uiStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDiscoverySearchStore } from '../../stores/discoverySearchStore';
import { EASE_EDITORIAL } from '../layout/motion';

const READY_DISCOVERY_PROVIDERS = new Set(['generic', 'archive_org']);
export type SourceCard = IIIFDiscoveryResult | (IIIFManifestPreview & { id: string });

export function isManifest(card: SourceCard): card is IIIFManifestPreview & { id: string } {
  return 'itemCount' in card;
}

const VIEW_OPTIONS: ReadonlyArray<{ value: DiscoveryResultsPerRow; labelKey: string; icon: ReactNode }> = [
  { value: 3, labelKey: 'settings.discoveryResultsThree', icon: <GridGlyph columns={3} /> },
  { value: 4, labelKey: 'settings.discoveryResultsFour', icon: <GridGlyph columns={4} /> },
  { value: 'list', labelKey: 'settings.discoveryResultsList', icon: <List size={14} /> },
];

function sourceTypeLabel(card: SourceCard, providerLabel: string): string {
  const mediaType = !isManifest(card) ? card.mediaType : null;
  return mediaType ? `${providerLabel} · ${mediaType}` : providerLabel;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** L'espansione resta sempre nella riga in cui si trova (mai a capo da sola):
 * prende `columns - 1` unità su `columns` totali, gli altri item della stessa
 * riga si dividono l'unità restante — funziona qualunque sia la sua posizione
 * nella riga (prima, in mezzo o ultima), perché la riga è un flex box a
 * larghezza fissa, non una griglia che può mandare a capo. */
function flexBasis(isExpandedCard: boolean, expandedInThisRow: boolean, columns: number): string {
  if (!expandedInThisRow) return '1 1 0%';
  if (isExpandedCard) return `${columns - 1} 1 0%`;
  return `${1 / (columns - 1)} 1 0%`;
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
  flexBasis: string;
  onToggle: () => void;
  onAddToLibrary: () => void;
  onAddToWorkspace: () => void;
  adding: boolean;
  alreadyAdded: boolean;
}

function SourceCardView({ card, providerLabel, expanded, flexBasis: basis, onToggle, onAddToLibrary, onAddToWorkspace, adding, alreadyAdded }: CardViewProps) {
  const { t } = useTranslation();
  const title = card.title || t('dashboard.discovery.untitled');

  return (
    <motion.article
      layout
      style={{ flex: basis, minWidth: 0 }}
      transition={{ duration: 0.28, ease: EASE_EDITORIAL }}
      className="overflow-hidden rounded-[20px] border border-editorial-border bg-surface-elevated text-left transition-colors hover:border-editorial-accent/45"
    >
      <div className="flex items-center justify-between gap-2 border-b border-editorial-border/70 px-3 py-1.5">
        <span className="truncate text-[11px] uppercase tracking-[0.1em] text-editorial-muted">{providerLabel}</span>
        <CardActions adding={adding} alreadyAdded={alreadyAdded} onAddToLibrary={onAddToLibrary} onAddToWorkspace={onAddToWorkspace} />
      </div>
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex w-full gap-4 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-editorial-border bg-editorial-textbox ${expanded ? 'h-44 w-32' : 'h-28 w-20'}`}>
          {card.thumbnailUrl ? <img src={card.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <BookOpenText size={20} className="text-editorial-muted" aria-hidden="true" />}
        </span>
        <span className="min-w-0 py-1">
          <span className={`block font-display italic leading-tight text-editorial-ink ${expanded ? 'text-2xl' : 'line-clamp-3 text-lg'}`}>{title}</span>
          {card.creator && <span className="mt-2 block line-clamp-2 text-sm text-editorial-charcoal"><span className="text-editorial-muted">{t('dashboard.discovery.by')}</span> {card.creator}</span>}
          {card.date && <span className="mt-1 block text-xs text-editorial-muted"><span>{t('dashboard.discovery.published')}</span> {card.date}</span>}
          {card.volume && <span className="mt-1 block text-xs text-editorial-muted"><span>{t('dashboard.discovery.volume')}</span> {card.volume}</span>}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="border-t border-editorial-border px-4 py-3">
              {card.description && <p className="text-sm leading-relaxed text-editorial-ink/80">{card.description}</p>}
              <dl className="mt-3 space-y-2 text-sm text-editorial-muted">
                {card.date && <div><dt className="inline text-editorial-muted">{t('dashboard.discovery.published')}</dt><dd className="inline pl-2 text-editorial-ink">{card.date}</dd></div>}
                {card.language && <div><dt className="inline text-editorial-muted">{t('dashboard.discovery.language')}</dt><dd className="inline pl-2 text-editorial-ink">{card.language}</dd></div>}
                {card.volume && <div><dt className="inline text-editorial-muted">{t('dashboard.discovery.volume')}</dt><dd className="inline pl-2 text-editorial-ink">{card.volume}</dd></div>}
                {!isManifest(card) && card.mediaType && <div><dt className="inline text-editorial-muted">{t('dashboard.discovery.type')}</dt><dd className="inline pl-2 text-editorial-ink">{card.mediaType}</dd></div>}
                {!isManifest(card) && card.collection && <div><dt className="inline text-editorial-muted">{t('dashboard.discovery.collection')}</dt><dd className="inline pl-2 text-editorial-ink">{card.collection}</dd></div>}
                {isManifest(card) && card.itemCount !== null && <div><dt className="inline text-editorial-muted">{t('dashboard.discovery.pages')}</dt><dd className="inline pl-2 text-editorial-ink">{card.itemCount}</dd></div>}
              </dl>
              {card.subjects.length > 0 && <p className="mt-3 text-xs leading-relaxed text-editorial-muted"><span className="text-editorial-ink">{t('dashboard.discovery.subjects')}:</span> {card.subjects.join(' · ')}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function SourceListRow({ card, providerLabel, expanded, onToggle, onAddToLibrary, onAddToWorkspace, adding, alreadyAdded }: Omit<CardViewProps, 'flexBasis'>) {
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
  const addFromDiscovery = useSourceLibraryStore((state) => state.addFromDiscovery);

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
  const rows = useMemo(() => isListView ? [] : chunk(cards, resultsPerRow === 4 ? 4 : 3), [cards, isListView, resultsPerRow]);

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
      setOutcome(outcome ? { ...next, results: [...outcome.results, ...next.results] } : next);
      setPage(nextPage);
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <section>
      <form className="flex items-center gap-2 border-y border-editorial-border py-3" onSubmit={submit}>
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
              onClick={() => setShowLayoutOptions((current) => !current)}
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
                  alreadyAdded={addedManifestUrls.has(card.manifestUrl)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {rows.map((row, rowIndex) => {
                const columns = row.length;
                const expandedInThisRow = row.some((card) => card.id === expandedId);
                return (
                  <motion.div layout key={rowIndex} className="flex gap-3">
                    {row.map((card) => (
                      <SourceCardView
                        key={card.id}
                        card={card}
                        providerLabel={selectedProvider?.label ?? ''}
                        expanded={expandedId === card.id}
                        flexBasis={flexBasis(expandedId === card.id, expandedInThisRow, columns)}
                        onToggle={() => setExpandedId((current) => current === card.id ? null : card.id)}
                        onAddToLibrary={() => void addFromDiscovery(card)}
                        onAddToWorkspace={() => setWorkspacePickerCard(card)}
                        adding={addingUrls.has(card.manifestUrl)}
                        alreadyAdded={addedManifestUrls.has(card.manifestUrl)}
                      />
                    ))}
                  </motion.div>
                );
              })}
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
