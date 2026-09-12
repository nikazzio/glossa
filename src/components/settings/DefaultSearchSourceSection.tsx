import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { SectionLabel, Select, SettingRow } from '../ui';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { useUiStore } from '../../stores/uiStore';
import { errorMessage, logger } from '../../utils/logger';
import type { IIIFProvider } from '../../types';

/** Nessuna preferenza: vale l'ultima fonte usata, che è il comportamento di
 *  sempre. Stringa vuota e non `null` perché è il valore di una tendina. */
const LAST_USED = '';

/**
 * La fonte da cui parte una ricerca nuova.
 *
 * Vale all'apertura dell'applicazione: durante la sessione comanda la scelta
 * fatta a mano nel pannello, altrimenti cambiare fonte sarebbe impossibile.
 * Le fonti che non cercano per parole non compaiono: sceglierle come punto di
 * partenza significherebbe aprire ogni volta su una schermata che non cerca.
 */
export function DefaultSearchSourceSection() {
  const { t } = useTranslation();
  const preferred = useUiStore((state) => state.defaultSearchProvider);
  const setPreferred = useUiStore((state) => state.setDefaultSearchProvider);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);

  useEffect(() => {
    let cancelled = false;
    listIIIFProviders()
      .then((items) => {
        if (cancelled) return;
        const list = Array.isArray(items) ? items : [];
        setProviders(list.filter((provider) => provider.supportsSearch));
      })
      .catch((error: unknown) => {
        logger.warn('default search provider list failed', { message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-4">
      <SectionLabel icon={Search} label={t('settings.library.defaultSourceTitle')} />
      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow
          label={t('settings.library.defaultSource')}
          hint={t('settings.library.defaultSourceHint')}
        >
          <Select
            value={providers.some((provider) => provider.key === preferred) ? preferred : LAST_USED}
            onChange={setPreferred}
            ariaLabel={t('settings.library.defaultSource')}
            size="md"
            options={[
              { value: LAST_USED, label: t('settings.library.defaultSourceLastUsed') },
              ...providers.map((provider) => ({
                value: provider.key,
                label: provider.label,
                group: t(`dashboard.discovery.group.${provider.kind === 'aggregator' ? 'aggregator' : 'library'}`),
              })),
            ]}
          />
        </SettingRow>
      </div>
    </section>
  );
}
