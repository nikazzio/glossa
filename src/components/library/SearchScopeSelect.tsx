import { useTranslation } from 'react-i18next';
import type { IIIFProvider } from '../../types';
import { Select } from '../ui';

const ALL = 'all';
const CUSTOM = 'custom';

/** Le biblioteche che una ricerca «in tutte» interroga: le raccolte si
 *  aggiungono di proposito, perché moltiplicano i risultati di altre istituzioni. */
export function allLibraries(providers: IIIFProvider[]): string[] {
  return providers
    .filter((provider) => provider.kind === 'library' && provider.supportsSearch)
    .map((provider) => provider.key);
}

function sameKeys(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((key) => right.includes(key));
}

/**
 * Dove si cerca, accanto alla casella: tutte le biblioteche, una sola, oppure
 * la scelta fatta a mano nei criteri. Scegliere «personalizzata» apre i criteri,
 * dove si spuntano le fonti una per una.
 */
export function SearchScopeSelect({ providers, chosen, onChange, onCustomize }: {
  providers: IIIFProvider[];
  chosen: string[];
  onChange: (keys: string[]) => void;
  onCustomize: () => void;
}) {
  const { t } = useTranslation();
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
  ];

  const choose = (next: string) => {
    if (next === ALL) onChange(everyLibrary);
    else if (next === CUSTOM) onCustomize();
    else onChange([next]);
  };

  return (
    <Select value={value} onChange={choose} options={options} ariaLabel={t('federation.scope.label')}
      disabled={providers.length === 0} className="max-w-[14rem] shrink-0" />
  );
}
