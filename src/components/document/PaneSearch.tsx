import { useTranslation } from 'react-i18next';
import { CatalogSearchField } from '../ui';

interface PaneSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
}

/** La ricerca dentro un foglio: stesso campo della ricerca nei cataloghi. */
export function PaneSearch({ value, onChange, label, autoFocus = false }: PaneSearchProps) {
  const { t } = useTranslation();

  return (
    <form role="search" aria-label={label} className="mb-3 shrink-0" onSubmit={(event) => event.preventDefault()}>
      <CatalogSearchField
        value={value}
        onChange={onChange}
        placeholder={t('document.searchChunkPlaceholder')}
        label={label}
        focusOnMount={autoFocus}
      />
    </form>
  );
}
