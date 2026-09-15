import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconLink, type IconButtonSize } from '../ui';
import type { IIIFProvider } from '../../types';

/**
 * «Cercalo sul sito della biblioteca».
 *
 * La ricerca dentro Glossa vede quello che la biblioteca espone a un
 * programma, che quasi mai è tutto il suo catalogo. Quando non basta o non
 * convince, la via d'uscita è il sito della biblioteca: si cerca lì, si copia
 * l'indirizzo dell'opera e la si apre qui. Le parole già scritte vengono
 * portate dove la biblioteca le accetta nell'indirizzo; altrimenti si apre la
 * sua pagina di ricerca vuota.
 */
export function ProviderSiteLink({ provider, query, size = 'sm', tooltipSide }: {
  provider: Pick<IIIFProvider, 'label' | 'siteSearch'> | undefined;
  query?: string;
  size?: IconButtonSize;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const { t } = useTranslation();
  const href = providerSiteUrl(provider?.siteSearch, query);
  if (!provider || !href) return null;

  return (
    <IconLink
      size={size}
      href={href}
      title={t('federation.openProviderSite', { provider: provider.label })}
      tooltipSide={tooltipSide}
    >
      <ExternalLink size={13} />
    </IconLink>
  );
}

/** L'indirizzo da aprire: con le parole dentro quando il modello le prevede. */
export function providerSiteUrl(template: string | undefined, query?: string): string | null {
  if (!template) return null;
  if (!template.includes('{query}')) return template;
  const words = query?.trim() ?? '';
  // Senza parole si apre comunque la pagina di ricerca: una ricerca vuota
  // porta all'elenco completo, che è esattamente il punto di partenza giusto.
  return template.replace('{query}', encodeURIComponent(words));
}
