import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenText, BookPlus, Check, ChevronDown, FolderPlus, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, IconButton, Select, Spinner } from '../ui';
import { discoverIIIF, listIIIFProviders } from '../../services/iiifProviderService';
import { getLibrarySourceDetail } from '../../services/libraryService';
import { isManifest, type IIIFProvider, type SourceCard } from '../../types';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDiscoverySearchStore } from '../../stores/discoverySearchStore';
import { EASE_EDITORIAL } from '../layout/motion';
import { relativeDateUnit } from '../../utils';
import { CachedThumbnail } from '../common/CachedThumbnail';

// Le biblioteche il cui riconoscimento e la cui ricerca sono davvero
// implementati lato backend (v. src-tauri/src/iiif/search.rs): elenco a mano
// perché `supportsSearch` del provider è vero anche per le biblioteche che
// non cercano ancora, dichiarazione preesistente e fuori scopo qui.
const READY_DISCOVERY_PROVIDERS = new Set(['generic', 'archive_org', 'vatican', 'gallica', 'ecodices']);

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

interface RowProps {
  card: SourceCard;
  providerKey: string;
  providerLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onAddToLibrary: () => void;
  onAddToWorkspace: () => void;
  adding: boolean;
  alreadyAdded: boolean;
}

/** Etichetta sopra, valore sotto: usata nella scheda espansa. I valori più
 * lunghi (fondo di conservazione, descrizione fisica) vanno a capo invece di
 * uscire dal riquadro. */
function ListStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{label}</p>
      <p className="mt-0.5 break-words font-display text-sm italic text-editorial-ink">{value}</p>
    </div>
  );
}

/** Etichetta sopra, indirizzo cliccabile sotto: per i link veri (pagina web,
 * catalogo cartaceo), non per i valori di testo di `ListStat`. */
function LinkStat({ label, url }: { label: string; url: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{label}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-0.5 block break-words font-display text-sm italic text-editorial-accent underline underline-offset-2"
      >
        {url}
      </a>
    </div>
  );
}

/** Tutte le informazioni disponibili per una scheda, etichetta/valore. */
function sourceStats(
  card: SourceCard,
  t: (key: string) => string,
  { includeCatalogUrl = true }: { includeCatalogUrl?: boolean } = {},
): Array<[string, string]> {
  return [
    card.creator && [t('dashboard.discovery.by'), card.creator],
    !isManifest(card) && card.contributors.length > 0 && [t('dashboard.discovery.contributors'), card.contributors.join(' · ')],
    card.date && [t('dashboard.discovery.published'), card.date],
    !isManifest(card) && card.publisher && [t('dashboard.discovery.publisher'), card.publisher],
    card.language && [t('dashboard.discovery.language'), card.language],
    card.volume && [t('dashboard.discovery.volume'), card.volume],
    !isManifest(card) && card.mediaType && [t('dashboard.discovery.type'), card.mediaType],
    isManifest(card) && card.materialType && [t('dashboard.discovery.type'), card.materialType],
    !isManifest(card) && card.collection && [t('dashboard.discovery.collection'), card.collection],
    card.itemCount !== null && [t('dashboard.discovery.pages'), String(card.itemCount)],
    !isManifest(card) && card.physicalDescription && [t('dashboard.discovery.physicalDescription'), card.physicalDescription],
    card.subjects.length > 0 && [t('dashboard.discovery.subjects'), card.subjects.join(' · ')],
    !isManifest(card) && card.rights.length > 0 && [t('dashboard.discovery.rights'), card.rights.join(' · ')],
    !isManifest(card) && card.holdingInstitution && [t('dashboard.discovery.holdingInstitution'), card.holdingInstitution],
    includeCatalogUrl && !isManifest(card) && card.catalogUrl && [t('dashboard.discovery.catalogUrl'), card.catalogUrl],
  ].filter((entry): entry is [string, string] => Boolean(entry));
}

// Piccola quando chiusa, più grande e leggibile quando la riga è aperta —
// stessa immagine, solo la cornice cambia dimensione. Larghezza esposta a
// parte perché la colonna di allineamento sotto il titolo (vedi in basso)
// deve restare identica senza ricalcolarla dalla stringa di classi.
const THUMBNAIL_WIDTH_EXPANDED = 'w-24';
const THUMBNAIL_SIZE = {
  closed: 'h-10 w-8',
  expanded: `h-32 ${THUMBNAIL_WIDTH_EXPANDED}`,
};

function SourceListRow({ card, providerKey, providerLabel, expanded, onToggle, onAddToLibrary, onAddToWorkspace, adding, alreadyAdded }: RowProps) {
  const { t } = useTranslation();
  const title = card.title || t('dashboard.discovery.untitled');
  // Il collegamento alla pagina web e quello al catalogo cartaceo sono
  // indirizzi veri: si aprono, non si leggono come le altre etichette.
  const pageUrl = !isManifest(card) ? card.pageUrl : null;
  const catalogUrl = !isManifest(card) ? card.catalogUrl : null;
  const stats = sourceStats(card, t, { includeCatalogUrl: false });
  const metaParts = [card.creator, card.date, sourceTypeLabel(card, providerLabel)].filter(Boolean) as string[];

  return (
    <motion.article
      layout
      transition={{ duration: 0.28, ease: EASE_EDITORIAL }}
      className={
        expanded
          ? 'my-1 overflow-hidden rounded-xl border border-editorial-accent/50 bg-surface-elevated shadow-sm'
          : 'overflow-hidden border-b border-editorial-border/70 transition-colors hover:bg-surface-hover/50'
      }
    >
      <div className={`flex gap-3 px-3 py-2.5 ${expanded ? 'items-start' : 'items-center'}`}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <span
            className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-editorial-border bg-editorial-textbox transition-all duration-200 ${
              expanded ? THUMBNAIL_SIZE.expanded : THUMBNAIL_SIZE.closed
            }`}
          >
            <CachedThumbnail
              url={card.thumbnailUrl}
              providerKey={providerKey}
              className="h-full w-full object-cover"
              fallback={<BookOpenText size={expanded ? 20 : 14} className="text-editorial-muted" aria-hidden="true" />}
            />
          </span>
          {expanded ? (
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block font-display text-lg italic leading-tight text-editorial-ink">{title}</span>
              <span className="mt-1 block text-xs text-editorial-muted">{metaParts.join(' · ')}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display italic text-editorial-ink">{title}</span>
              <span className="mt-0.5 block truncate text-xs text-editorial-muted">{metaParts.join(' · ')}</span>
            </span>
          )}
        </button>
        <CardActions adding={adding} alreadyAdded={alreadyAdded} onAddToLibrary={onAddToLibrary} onAddToWorkspace={onAddToWorkspace} />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="flex gap-3 px-3 pb-3">
              {/* Colonna vuota della stessa larghezza della copertina: fa allineare il testo sotto al titolo, non sotto alla copertina. */}
              <span className={`shrink-0 ${THUMBNAIL_WIDTH_EXPANDED}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-3">
                {card.description && <p className="text-sm leading-relaxed text-editorial-ink/80">{card.description}</p>}
                {stats.length > 0 && (
                  <div className="grid grid-cols-1 gap-y-2">
                    {stats.map(([label, value]) => <ListStat key={label} label={label} value={value} />)}
                  </div>
                )}
                {pageUrl && <LinkStat label={t('dashboard.discovery.pageUrl')} url={pageUrl} />}
                {catalogUrl && <LinkStat label={t('dashboard.discovery.catalogUrl')} url={catalogUrl} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function SourceDiscoveryPanel() {
  const { t } = useTranslation();
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
  const [workspacePickerCard, setWorkspacePickerCard] = useState<SourceCard | null>(null);
  // Workspace a cui l'opera del picker aperto è già collegata: null finché non
  // si sa (opera nuova, mai aggiunta prima), così non si mostra un elenco vuoto
  // per un'attesa che non è ancora finita.
  const [workspacePickerLinkedIds, setWorkspacePickerLinkedIds] = useState<string[] | null>(null);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const addingUrls = useSourceLibraryStore((state) => state.addingUrls);
  const addedManifestUrls = useSourceLibraryStore((state) => state.addedManifestUrls);
  const libraryManifestUrls = useSourceLibraryStore((state) => state.libraryManifestUrls);
  const libraryManifestSourceIds = useSourceLibraryStore((state) => state.libraryManifestSourceIds);
  const addFromDiscovery = useSourceLibraryStore((state) => state.addFromDiscovery);
  const loadLibraryManifestUrls = useSourceLibraryStore((state) => state.loadLibraryManifestUrls);
  const libraryError = useSourceLibraryStore((state) => state.error);
  const clearLibraryError = useSourceLibraryStore((state) => state.clearError);

  const isAlreadyInLibrary = (manifestUrl: string) =>
    addedManifestUrls.has(manifestUrl) || libraryManifestUrls.has(manifestUrl);

  useEffect(() => {
    if (!workspacePickerCard) {
      setWorkspacePickerLinkedIds(null);
      return;
    }
    const sourceId = libraryManifestSourceIds.get(workspacePickerCard.manifestUrl);
    if (!sourceId) {
      setWorkspacePickerLinkedIds(null);
      return;
    }
    let cancelled = false;
    getLibrarySourceDetail(sourceId)
      .then((detail) => { if (!cancelled) setWorkspacePickerLinkedIds(detail.linkedWorkspaceIds); })
      .catch(() => { if (!cancelled) setWorkspacePickerLinkedIds(null); });
    return () => { cancelled = true; };
  }, [workspacePickerCard, libraryManifestSourceIds]);

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
  }, [setProviderKey]);

  const selectedProvider = providers.find((provider) => provider.key === providerKey);
  const cards = useMemo<SourceCard[]>(() => {
    if (!outcome) return [];
    return outcome.manifest ? [{ ...outcome.manifest, id: outcome.manifest.manifestUrl }] : outcome.results;
  }, [outcome]);
  // «di quanto tempo fa» si ricalcola a ogni disegno: la finestra resta aperta
  // per minuti, e una riga che dice «adesso» per mezz'ora è peggio di niente.
  const cachedUnit = relativeDateUnit((outcome?.cachedAt ?? 0) * 1000);

  const search = async (fresh: boolean) => {
    if (!input.trim()) return;
    setSearching(true);
    setExpandedId(null);
    setPage(1);
    setOutcome(null);
    setSearchError(false);
    try {
      setOutcome(await discoverIIIF(providerKey, input.trim(), 1, fresh));
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search(false);
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
      {outcome?.cachedAt !== undefined && outcome.cachedAt !== null && (
        // Un risultato conservato non si distingue da uno appena arrivato, e
        // senza saperlo non si può decidere se vale la pena rifare la ricerca.
        <p className="mt-3 flex items-center gap-2 text-[11px] text-editorial-muted">
          <span>
            {t('dashboard.discovery.fromCache', {
              when: t(`common.relative.${cachedUnit.key}`, { count: cachedUnit.count ?? 0 }),
            })}
          </span>
          <IconButton
            title={t('dashboard.discovery.searchAgain')}
            onClick={() => void search(true)}
            disabled={searching}
            size="xs"
          >
            <RefreshCw size={12} />
          </IconButton>
        </p>
      )}
      {outcome?.status === 'not_found' && <p className="mt-4 text-sm text-editorial-muted">{t('dashboard.discovery.notFound')}</p>}
      {searchError && <p className="mt-4 text-sm text-editorial-danger" role="alert">{t('dashboard.discovery.searchFailed')}</p>}
      {cards.length > 0 && (
        <div className="mt-4">
          {cards.map((card) => (
            <SourceListRow
              key={card.id}
              card={card}
              providerKey={providerKey}
              providerLabel={selectedProvider?.label ?? ''}
              expanded={expandedId === card.id}
              onToggle={() => setExpandedId((current) => current === card.id ? null : card.id)}
              onAddToLibrary={() => void addFromDiscovery(card, undefined, providerKey)}
              onAddToWorkspace={() => setWorkspacePickerCard(card)}
              adding={addingUrls.has(card.manifestUrl)}
              alreadyAdded={isAlreadyInLibrary(card.manifestUrl)}
            />
          ))}
        </div>
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
              {workspaces.map((workspace) => {
                const linked = workspacePickerLinkedIds?.includes(workspace.id) ?? false;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    disabled={linked}
                    onClick={() => {
                      if (workspacePickerCard) void addFromDiscovery(workspacePickerCard, workspace.id, providerKey);
                      setWorkspacePickerCard(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 truncate font-display text-base italic text-editorial-ink">{workspace.name}</span>
                    {linked && (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-editorial-accent">
                        <Check size={14} />
                        {t('dashboard.discovery.alreadyLinked')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>
    </section>
  );
}
