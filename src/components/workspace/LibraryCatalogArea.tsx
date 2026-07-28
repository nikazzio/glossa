import { useEffect, useState } from 'react';
import { BookOpen, LibraryBig, Search, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, SectionLabel, Spinner } from '../ui';
import { listIIIFProviders } from '../../services/iiifProviderService';
import type { IIIFProvider } from '../../types';

/**
 * Area globale Biblioteca: il catalogo delle fonti arriverà con #216. Intanto
 * mostra le capacità di discovery dichiarate dal registry #214.
 */
export function LibraryCatalogArea() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<IIIFProvider[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listIIIFProviders()
      .then((loadedProviders) => {
        if (!cancelled) setProviders(loadedProviders);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => { cancelled = true; };
  }, []);

  const capabilityLabel = (provider: IIIFProvider) => {
    if (!provider.supports_search) return t('areas.library.capabilities.direct');
    return t(`areas.library.capabilities.${provider.search_mode}`);
  };

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <h1 className="mb-5 font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('areas.library.title')}
        </h1>
        {providers === null && !loadFailed && (
          <div className="flex min-h-48 items-center justify-center" role="status">
            <Spinner />
          </div>
        )}
        {loadFailed && (
          <EmptyState
            icon={<LibraryBig size={28} />}
            message={t('areas.library.registryError')}
            hint={t('areas.library.registryErrorHint')}
          />
        )}
        {providers && (
          <section className="max-w-4xl space-y-4">
            <div className="space-y-2 border-y border-editorial-border/70 py-4">
              <SectionLabel icon={BookOpen} label={t('areas.library.providersLabel')} />
              <p className="text-sm leading-relaxed text-editorial-ink/80">
                {t('areas.library.providersIntro')}
              </p>
              <p className="font-display text-sm italic text-editorial-ink">
                {t('areas.library.providersCount', { count: providers.length })}
              </p>
            </div>

            <div className="divide-y divide-editorial-border/70 border-y border-editorial-border/70">
              {providers.map((provider) => (
                <article key={provider.key} className="grid gap-2 px-1 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
                  <div>
                    <h2 className="font-display text-lg italic text-editorial-ink">{provider.label}</h2>
                    <p className="mt-1 text-xs text-editorial-muted">{provider.placeholder}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-editorial-charcoal">
                    {provider.supports_search ? <Search size={13} aria-hidden="true" /> : <Link size={13} aria-hidden="true" />}
                    <span>{capabilityLabel(provider)}</span>
                    {provider.filters.length > 0 && (
                      <span className="border-l border-editorial-border pl-2">
                        {t('areas.library.filtersAvailable', { count: provider.filters.length })}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-editorial-muted">{t('areas.library.providersNext')}</p>
          </section>
        )}
      </div>
    </main>
  );
}
