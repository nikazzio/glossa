import { BookOpen, Globe, Info, Quote, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IIIFProvider, IIIFSearchField } from '../../types';
import { useFederatedSearchStore } from '../../stores/federatedSearchStore';
import { FIELD_CLASSNAME, FIELD_NUMBER_CLASSNAME, FieldLabel, Hint, IconButton, SectionLabel, Select, ToggleRow } from '../ui';

const TEXT_FIELDS = ['title', 'author', 'publisher', 'institution', 'language'] as const;

/** Il campo del registro che corrisponde a ogni criterio, se qualcuno lo cerca. */
const SEARCH_FIELD: Record<typeof TEXT_FIELDS[number] | 'material' | 'years' | 'phrase', IIIFSearchField | null> = {
  title: 'title', author: 'author', publisher: 'publisher', institution: null, language: null,
  material: 'material', years: 'years', phrase: 'phrase',
};

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
  /** Chi fra le biblioteche scelte cerca davvero questo criterio: le altre lo
   *  usano solo per filtrare i risultati arrivati. */
  const reach = (key: keyof typeof SEARCH_FIELD, fallbackKey = 'federation.fieldFiltered') => {
    const field = SEARCH_FIELD[key];
    const asking = field === null ? [] : providers
      .filter((provider) => selected.includes(provider.key) && provider.searchFields.includes(field))
      .map((provider) => provider.label);
    return asking.length > 0
      ? t('federation.fieldAsked', { libraries: asking.join(' · ') })
      : t(fallbackKey);
  };
  const field = (key: typeof TEXT_FIELDS[number]) => (
    <label key={key} className="block space-y-1.5">
      <FieldLabel block hint={reach(key)}>{t(`federation.fields.${key}`)}</FieldLabel>
      <input className={FIELD_CLASSNAME} value={criteria[key]} maxLength={1000}
        aria-label={t(`federation.fields.${key}`)}
        onChange={(event) => setCriteria({ ...criteria, [key]: event.target.value })} />
    </label>
  );
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="space-y-5 p-4">
    {/* Il comando di avvio non sta in fondo a una colonna che scorre: resta in
        vista mentre si scrivono i criteri e si scelgono le fonti. */}
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-center justify-between gap-2 border-b border-editorial-border bg-surface-panel px-4 py-2.5">
      {/* La spiegazione la porta il conteggio delle fonti, che è il testo a cui
          si riferisce: i criteri valgono per la prossima ricerca. */}
      <span className="min-w-0 truncate text-xs text-editorial-muted">
        <Hint label={t('federation.draftHint')}>{t('federation.selectedCount', { count: selected.length })}</Hint>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton type="submit" title={t('federation.launch')}
          disabled={busy || !selected.length}><Search size={18} /></IconButton>
      </div>
    </div>

    <section className="space-y-3">
      <SectionLabel icon={Info} label={t('federation.criteriaGroup')} hint={t('federation.criteriaHint')} />
      {/* Solo dove la biblioteca lo sa fare: le altre cercano le parole come
          sempre, e il suggerimento dice quali la rispettano. */}
      <ToggleRow icon={<Quote size={14} />} label={t('federation.fields.exactPhrase')}
        hint={reach('phrase', 'federation.phraseIgnored')} checked={Boolean(criteria.exactPhrase)}
        onChange={() => setCriteria({ ...criteria, exactPhrase: !criteria.exactPhrase })} />
      {TEXT_FIELDS.map(field)}
      <label className="block space-y-1.5">
        <FieldLabel block hint={reach('material')}>{t('federation.fields.material')}</FieldLabel>
        <Select value={criteria.material} onChange={(material) => setCriteria({ ...criteria, material })}
          ariaLabel={t('federation.fields.material')} className="w-full"
          options={['', 'manuscript', 'printed'].map((value) => ({ value, label: t(`federation.material.${value || 'all'}`) }))} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(['yearFrom', 'yearTo'] as const).map((key) => <label key={key} className="block space-y-1.5">
          <FieldLabel block hint={`${reach('years')} ${t('federation.dateHint')}`}>{t(`federation.fields.${key}`)}</FieldLabel>
          <input type="number" min={1} max={9999} step={1} className={FIELD_NUMBER_CLASSNAME}
            aria-label={t(`federation.fields.${key}`)} value={criteria[key] ?? ''}
            onChange={(event) => setCriteria({ ...criteria, [key]: event.target.value === '' ? null : Number(event.target.value) })} />
        </label>)}
      </div>
    </section>

    {(['library', 'aggregator'] as const).map((kind) => {
      const group = searchable.filter((provider) => provider.kind === kind);
      if (!group.length) return null;
      return <section key={kind} className="space-y-3">
        <div className="flex items-center gap-1.5">
          <SectionLabel icon={kind === 'library' ? BookOpen : Globe} label={t(`federation.${kind}`)}
            hint={kind === 'aggregator' ? t('federation.aggregatorHint') : undefined} />
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
        {unavailable.map((provider) => (
          <Hint key={provider.key} label={`${provider.label} — ${t(unavailableHintKey(provider))}`}>
            <span className="rounded border border-dashed border-editorial-border px-1.5 py-0.5">{provider.label}</span>
          </Hint>
        ))}
      </p>
    </section>}
  </form>;
}
