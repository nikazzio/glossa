import { BookOpen, Globe, Info, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IIIFProvider } from '../../types';
import { useFederatedSearchStore } from '../../stores/federatedSearchStore';
import { FIELD_CLASSNAME, FieldLabel, IconButton, SectionLabel, Select, Tooltip, ToggleRow } from '../ui';

const LOCAL_TEXT_FIELDS = ['title', 'author', 'publisher', 'institution', 'language'] as const;

/** Chi non cerca per parole non è un errore da spiegare riga per riga: sta in
 *  un gruppo solo, con il motivo al passaggio del mouse. */
function unavailableHintKey(provider: IIIFProvider): string {
  return provider.availability === 'paused'
    ? 'dashboard.discovery.groupHint.paused'
    : 'dashboard.discovery.groupHint.directOnly';
}

export function SearchCriteriaPanel({ providers, busy, onSubmit }: {
  providers: IIIFProvider[]; busy: boolean; onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const { criteria, providers: chosen, setCriteria, setProviders } = useFederatedSearchStore();
  const selected = chosen ?? [];
  const toggle = (key: string) =>
    setProviders(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  const searchable = providers.filter((provider) => provider.supportsSearch);
  const unavailable = providers.filter((provider) => !provider.supportsSearch);
  const field = (key: 'query' | typeof LOCAL_TEXT_FIELDS[number]) => (
    <label key={key} className="block space-y-1.5">
      <FieldLabel block>{t(`federation.fields.${key}`)}</FieldLabel>
      <input className={`${FIELD_CLASSNAME} text-xs`} value={criteria[key]} maxLength={1000}
        aria-label={t(`federation.fields.${key}`)} required={key === 'query'}
        onChange={(event) => setCriteria({ ...criteria, [key]: event.target.value })} />
    </label>
  );
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="space-y-5 p-4">
    {/* Il comando di avvio non sta in fondo a una colonna che scorre: resta in
        vista mentre si scrivono i criteri e si scelgono le fonti. */}
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-center justify-between gap-2 border-b border-editorial-border bg-surface-panel px-4 py-2.5">
      <span className="min-w-0 truncate text-xs text-editorial-muted">{t('federation.selectedCount', { count: selected.length })}</span>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton title={t('federation.draftHint')} size="xs"><Info size={14} /></IconButton>
        <IconButton type="submit" tone="accent" title={t('federation.launch')}
          disabled={busy || !criteria.query.trim() || !selected.length}><Search size={18} /></IconButton>
      </div>
    </div>

    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <SectionLabel icon={Search} label={t('federation.remoteGroup')} />
        <IconButton title={t('federation.queryHint')} size="xs"><Info size={13} /></IconButton>
      </div>
      {field('query')}
    </section>

    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <SectionLabel icon={Info} label={t('federation.localGroup')} />
        <IconButton title={t('federation.localHint')} size="xs"><Info size={13} /></IconButton>
      </div>
      {LOCAL_TEXT_FIELDS.map(field)}
      <label className="block space-y-1.5">
        <FieldLabel block>{t('federation.fields.material')}</FieldLabel>
        <Select value={criteria.material} onChange={(material) => setCriteria({ ...criteria, material })}
          ariaLabel={t('federation.fields.material')} className="w-full"
          options={['', 'manuscript', 'printed'].map((value) => ({ value, label: t(`federation.material.${value || 'all'}`) }))} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(['yearFrom', 'yearTo'] as const).map((key) => <label key={key} className="block space-y-1.5">
          <FieldLabel block>{t(`federation.fields.${key}`)}</FieldLabel>
          <input type="number" min={1} max={9999} step={1} className={`${FIELD_CLASSNAME} text-xs`}
            aria-label={t(`federation.fields.${key}`)} value={criteria[key] ?? ''}
            onChange={(event) => setCriteria({ ...criteria, [key]: event.target.value === '' ? null : Number(event.target.value) })} />
        </label>)}
      </div>
      <p className="text-xs text-editorial-muted">{t('federation.dateHint')}</p>
    </section>

    {(['library', 'aggregator'] as const).map((kind) => {
      const group = searchable.filter((provider) => provider.kind === kind);
      if (!group.length) return null;
      return <section key={kind} className="space-y-3">
        <div className="flex items-center gap-1.5">
          <SectionLabel icon={kind === 'library' ? BookOpen : Globe} label={t(`federation.${kind}`)} />
          {kind === 'aggregator' && <IconButton title={t('federation.aggregatorHint')} size="xs"><Info size={13} /></IconButton>}
        </div>
        <div className="divide-y divide-editorial-border/50 border-y border-editorial-border/70">
          {group.map((provider) => <div key={provider.key} className="py-2">
            <ToggleRow icon={kind === 'library' ? <BookOpen size={14} /> : <Globe size={14} />}
              label={provider.label} checked={selected.includes(provider.key)} onChange={() => toggle(provider.key)} />
          </div>)}
        </div>
      </section>;
    })}

    {unavailable.length > 0 && <section className="space-y-2">
      <SectionLabel icon={Info} label={t('federation.unavailableGroup', { count: unavailable.length })} />
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-editorial-muted">
        {unavailable.map((provider) => <Tooltip key={provider.key} label={t(unavailableHintKey(provider))}>
          <span tabIndex={0} className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">{provider.label}</span>
        </Tooltip>)}
      </p>
    </section>}
  </form>;
}
