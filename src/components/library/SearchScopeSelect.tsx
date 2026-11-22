import { useTranslation } from 'react-i18next';
import type { IIIFProvider } from '../../types';
import { Select, useOpenExternal } from '../ui';
import { providerSiteUrl } from './ProviderSiteLink';

const ALL = 'all';
const CUSTOM = 'custom';
/** Prefisso delle voci che aprono il sito di una biblioteca invece di sceglierla. */
const SITE = 'site:';

/**
 * Biblioteche che restano fuori da «tutte» e si scelgono a mano. La Library of
 * Congress risponde alle ricerche automatiche con una verifica anti-robot che
 * solo un browser supera; la Biblioteca di Scozia non ha una ricerca
 * interrogabile, e Glossa cerca soltanto in un elenco di titoli scaricato.
 * In «tutte» darebbero un errore o uno zero a ogni ricerca.
 */
const NOT_IN_ALL: ReadonlySet<string> = new Set(['loc', 'nls']);

/** Le biblioteche che una ricerca «in tutte» interroga: le raccolte si
 *  aggiungono di proposito, perché moltiplicano i risultati di altre istituzioni. */
export function allLibraries(providers: IIIFProvider[]): string[] {
  return providers
    .filter((provider) => provider.kind === 'library' && provider.supportsSearch && !NOT_IN_ALL.has(provider.key))
    .map((provider) => provider.key);
}

function sameKeys(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((key) => right.includes(key));
}

/** Le biblioteche che Glossa non sa interrogare ma di cui conosce il sito. */
export function siteOnlyLibraries(providers: IIIFProvider[]): IIIFProvider[] {
  return providers.filter((provider) => provider.kind === 'library' && !provider.supportsSearch && provider.siteSearch !== '');
}

/**
 * Dove si cerca, accanto alla casella: tutte le biblioteche, una sola, oppure
 * la scelta fatta a mano nei criteri. Scegliere «personalizzata» apre i criteri,
 * dove si spuntano le fonti una per una. In fondo, le biblioteche consultabili
 * solo sul loro sito: sceglierne una apre il sito con le parole scritte e lascia
 * com'era la scelta di dove cercare.
 */
export function SearchScopeSelect({ providers, chosen, query, onChange, onCustomize }: {
  providers: IIIFProvider[];
  chosen: string[];
  query: string;
  onChange: (keys: string[]) => void;
  onCustomize: () => void;
}) {
  const { t } = useTranslation();
  const openExternal = useOpenExternal();
  const siteOnly = siteOnlyLibraries(providers);
  const everyLibrary = allLibraries(providers);
  const searchable = providers.filter((provider) => provider.supportsSearch);
  const value = chosen.length === 1
    ? chosen[0]
    : sameKeys(chosen, everyLibrary) ? ALL : CUSTOM;

  const options = [
    { value: ALL, label: t('federation.scope.all') },
    { value: CUSTOM, label: t('federation.scope.custom', { count: chosen.length }) },
    ...(['library', 'aggregator'] as const).flatMap((kind) => searchable
      .filter((provider) => provider.kind === kind)
      .map((provider) => ({ value: provider.key, label: provider.label, group: t(`federation.${kind}`) }))),
    ...siteOnly.map((provider) => ({ value: `${SITE}${provider.key}`, label: provider.label, group: t('federation.siteOnly') })),
  ];

  const choose = (next: string) => {
    if (next.startsWith(SITE)) {
      const href = providerSiteUrl(siteOnly.find((provider) => `${SITE}${provider.key}` === next)?.siteSearch, query);
      if (href) openExternal(href);
    } else if (next === ALL) onChange(everyLibrary);
    else if (next === CUSTOM) onCustomize();
    else onChange([next]);
  };

  return (
    <Select value={value} onChange={choose} options={options} ariaLabel={t('federation.scope.label')}
      disabled={providers.length === 0} className="max-w-[14rem] shrink-0" />
  );
}
