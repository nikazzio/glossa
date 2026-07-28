import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenText, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, IconButton, SectionLabel, Select, Spinner } from '../ui';
import { discoverIIIF, listIIIFProviders } from '../../services/iiifProviderService';
import type { IIIFDiscoveryOutcome, IIIFDiscoveryResult, IIIFManifestPreview, IIIFProvider } from '../../types';
import { useUiStore } from '../../stores/uiStore';

const READY_DISCOVERY_PROVIDERS = new Set(['generic', 'archive_org']);
type SourceCard = IIIFDiscoveryResult | (IIIFManifestPreview & { id: string });

function isManifest(card: SourceCard): card is IIIFManifestPreview & { id: string } {
  return 'itemCount' in card;
}

function SourceCardView({ card, providerLabel, expanded, onToggle }: { card: SourceCard; providerLabel: string; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <motion.article
      layout
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      className={`group cursor-pointer overflow-hidden rounded-[20px] border border-editorial-border bg-surface-elevated text-left transition-colors hover:border-editorial-accent/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${expanded ? 'sm:col-span-full' : ''}`}
    >
      <div className="flex gap-4 p-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-editorial-border bg-editorial-textbox ${expanded ? 'h-44 w-32' : 'h-28 w-20'}`}>
          {card.thumbnailUrl ? <img src={card.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <BookOpenText size={20} className="text-editorial-muted" aria-hidden="true" />}
        </div>
        <div className="min-w-0 py-1">
          <p className={`font-display italic leading-tight text-editorial-ink ${expanded ? 'text-2xl' : 'line-clamp-3 text-lg'}`}>{card.title}</p>
          {card.creator && <p className="mt-2 line-clamp-2 text-sm text-editorial-charcoal"><span className="text-editorial-muted">{t('dashboard.discovery.by')}</span> {card.creator}</p>}
          {card.date && <p className="mt-1 text-xs text-editorial-muted"><span>{t('dashboard.discovery.published')}</span> {card.date}</p>}
          {card.volume && <p className="mt-1 text-xs text-editorial-muted"><span>{t('dashboard.discovery.volume')}</span> {card.volume}</p>}
          <p className="mt-2 text-xs text-editorial-muted">{providerLabel}</p>
        </div>
      </div>
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

export function SourceDiscoveryPanel() {
  const { t } = useTranslation();
  const resultsPerRow = useUiStore((state) => state.discoveryResultsPerRow);
  const setResultsPerRow = useUiStore((state) => state.setDiscoveryResultsPerRow);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);
  const [providerKey, setProviderKey] = useState('archive_org');
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<IIIFDiscoveryOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showLayoutOptions, setShowLayoutOptions] = useState(false);

  useEffect(() => {
    listIIIFProviders()
      .then((items) => {
        const ready = items.filter((provider) => READY_DISCOVERY_PROVIDERS.has(provider.key));
        setProviders(ready);
        setProviderKey((current) => ready.some((provider) => provider.key === current) ? current : (ready[0]?.key ?? current));
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedProvider = providers.find((provider) => provider.key === providerKey);
  const cards = useMemo<SourceCard[]>(() => {
    if (!outcome) return [];
    return outcome.manifest ? [{ ...outcome.manifest, id: outcome.manifest.manifestUrl }] : outcome.results;
  }, [outcome]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    setSearching(true);
    setExpandedId(null);
    setPage(1);
    setOutcome(null);
    try {
      setOutcome(await discoverIIIF(providerKey, input.trim(), 1));
    } catch {
      setOutcome({ status: 'not_found', providerKey, manifest: null, results: [], hasMore: false });
    } finally {
      setSearching(false);
    }
  };

  const loadMore = async () => {
    if (!outcome || searching) return;
    const nextPage = page + 1;
    setSearching(true);
    try {
      const next = await discoverIIIF(providerKey, input.trim(), nextPage);
      setOutcome((current) => current ? { ...next, results: [...current.results, ...next.results] } : next);
      setPage(nextPage);
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
        <IconButton title={t('settings.discoveryTab')} onClick={() => setShowLayoutOptions(true)}>
          <SlidersHorizontal size={16} />
        </IconButton>
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
      {cards.length > 0 && <div className={`mt-4 grid gap-3 ${resultsPerRow === 4 ? 'sm:grid-cols-3 2xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>{cards.map((card) => <SourceCardView key={card.id} card={card} providerLabel={selectedProvider?.label ?? ''} expanded={expandedId === card.id} onToggle={() => setExpandedId((current) => current === card.id ? null : card.id)} />)}</div>}
      {outcome?.hasMore && (
        <div className="mt-4 flex justify-center">
          <IconButton title={t('dashboard.discovery.loadMore')} onClick={() => void loadMore()} disabled={searching}>
            {searching ? <Spinner size={16} className="text-editorial-muted" /> : <ChevronDown size={16} />}
          </IconButton>
        </div>
      )}
      <Dialog
        open={showLayoutOptions}
        onOpenChange={setShowLayoutOptions}
        title={t('settings.discoveryTab')}
        eyebrow={t('dashboard.title')}
        closeLabel={t('common.close')}
      >
        <div className="space-y-3">
          <SectionLabel icon={SlidersHorizontal} label={t('settings.discoveryResultsLayout')} />
          <div role="radiogroup" aria-label={t('settings.discoveryResultsLayout')} className="flex items-center gap-2">
            {([3, 4] as const).map((count) => (
              <IconButton
                key={count}
                tone={resultsPerRow === count ? 'accent' : 'default'}
                title={t(count === 3 ? 'settings.discoveryResultsThree' : 'settings.discoveryResultsFour')}
                onClick={() => setResultsPerRow(count)}
                role="radio"
                aria-checked={resultsPerRow === count}
              >
                <GridGlyph columns={count} />
              </IconButton>
            ))}
          </div>
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
