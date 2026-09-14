import { useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  FileJson,
  Image,
  Landmark,
  Library,
  Loader2,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyButton, IconLink, Tooltip } from '../ui';
import { readManifestText } from '../../services/iiifProviderService';
import { libraryItemUrl, libraryPageUrl } from '../../services/libraryLinks';
import { summarizeManifest, type ManifestSummary } from '../../services/manifestSummary';
import { providerSiteUrl } from '../library/ProviderSiteLink';
import { errorMessage, logger } from '../../utils/logger';
import type { IIIFProvider, LibrarySourceDetail, LibrarySourceVersion } from '../../types';

/** La pagina che il visore sta mostrando, quando è di questa copia. */
export interface ShownPage {
  index: number;
  imageUrl: string | null;
}

/** Ogni indirizzo ha il suo segno: il nome per esteso sta nel tooltip, perché
 *  sei righe di etichette accanto a sei indirizzi sono una colonna di parole
 *  che nessuno rilegge. */
const LINK_ICONS: Record<string, LucideIcon> = {
  manifest: FileJson,
  item: BookOpen,
  catalog: Landmark,
  shownPage: ScrollText,
  shownImage: Image,
  librarySite: Library,
};

/**
 * Tutto quello che di questa copia è un indirizzo, più il manifesto letto.
 *
 * Gli indirizzi erano sparsi: il manifesto qui, la pagina della biblioteca in
 * cima alla scheda, l'immagine da nessuna parte. Chi lavora con i manifesti li
 * vuole tutti insieme, copiabili e apribili. Il manifesto, quando lo si chiede,
 * si legge come dichiarazione della biblioteca sull'opera: il documento grezzo
 * è a un click, qui serve capirlo.
 */
export function VersionTechnicalData({ version, detail, provider, shownPage }: {
  version: LibrarySourceVersion;
  detail: LibrarySourceDetail;
  provider?: IIIFProvider;
  shownPage?: ShownPage | null;
}) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<ManifestSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const manifestUrl = version.sourceUrl ?? '';
  const providerKey = version.providerKey;
  const links: { key: string; url: string | null }[] = [
    { key: 'manifest', url: version.sourceUrl },
    { key: 'item', url: detail.pageUrl ?? libraryItemUrl(providerKey, manifestUrl) },
    { key: 'catalog', url: detail.catalogUrl },
    {
      key: 'shownPage',
      url: shownPage ? libraryPageUrl(providerKey, manifestUrl, shownPage.index) : null,
    },
    { key: 'shownImage', url: shownPage?.imageUrl ?? null },
    { key: 'librarySite', url: providerSiteUrl(provider?.siteSearch) },
  ];
  const shown = links.filter((link): link is { key: string; url: string } => Boolean(link.url));

  async function loadManifest(): Promise<void> {
    if (manifest || loading || !version.sourceUrl || !providerKey) return;
    setLoading(true);
    try {
      setManifest(summarizeManifest(await readManifestText(providerKey, version.sourceUrl)));
      setFailed(false);
    } catch (error) {
      logger.warn('library.manifestText.failed', { reason: errorMessage(error) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (shown.length === 0) return null;

  return (
    <details className="border-t border-editorial-border/70 pt-2 text-xs text-editorial-muted">
      <summary className="cursor-pointer font-semibold">{t('areas.library.technicalData')}</summary>

      <ul className="mt-2 space-y-1">
        {shown.map((link) => {
          const Icon = LINK_ICONS[link.key] ?? ExternalLink;
          const name = t(`areas.library.technicalLinks.${link.key}`);
          return (
            <li key={link.key} className="flex items-center gap-1.5">
              <Tooltip label={name} side="left">
                <span className="shrink-0 text-editorial-muted" role="img" aria-label={name}>
                  <Icon size={13} aria-hidden="true" />
                </span>
              </Tooltip>
              {/* Gli indirizzi sono lunghi e la colonna è stretta: per esteso
                  si leggono al passaggio del mouse, senza aprire niente. */}
              <Tooltip label={link.url} side="top">
                <span className="min-w-0 flex-1 truncate text-editorial-ink">{link.url}</span>
              </Tooltip>
              <CopyButton text={link.url} size="xs" />
              <IconLink size="xs" href={link.url} title={name} tooltipSide="left">
                <ExternalLink size={12} />
              </IconLink>
            </li>
          );
        })}
      </ul>

      {version.sourceUrl && providerKey && (
        <div className="mt-2 border-t border-editorial-border/70 pt-2">
          {/* Si preme la riga intera, segno e parole: un bersaglio da tredici
              pixel accanto a un testo inerte si sbaglia tutte le volte. */}
          <button
            type="button"
            onClick={() => void loadManifest()}
            disabled={loading || Boolean(manifest)}
            className="flex w-full items-center gap-1.5 text-left text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-default disabled:hover:text-editorial-muted"
          >
            {loading ? (
              <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <ScrollText size={13} className="shrink-0" aria-hidden="true" />
            )}
            <Tooltip label={manifest?.title ?? t('areas.library.manifestContent')} side="top">
              <span className="min-w-0 flex-1 truncate">
                {manifest?.title ?? t('areas.library.manifestContent')}
              </span>
            </Tooltip>
          </button>

          {failed && (
            <p role="alert" className="mt-1 text-editorial-danger">
              {t('areas.library.manifestContentFailed')}
            </p>
          )}

          {manifest && (
            <dl className="mt-2 space-y-1">
              {manifest.pages !== null && (
                <ManifestRow label={t('areas.library.manifestPages')} value={String(manifest.pages)} />
              )}
              {manifest.summary && (
                <ManifestRow label={t('areas.library.manifestSummary')} value={manifest.summary} />
              )}
              {manifest.fields.map((field) => (
                <ManifestRow key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
              ))}
              {manifest.rights.map((value) => (
                <ManifestRow key={value} label={t('areas.library.manifestRights')} value={value} />
              ))}
            </dl>
          )}
        </div>
      )}
    </details>
  );
}

/** Una voce del manifesto: nome a sinistra, valore che va a capo a destra.
 *  Il nome si tronca quando è lungo, e allora si legge al passaggio del mouse. */
function ManifestRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Tooltip label={label} side="left">
        <dt className="w-24 shrink-0 truncate font-semibold text-editorial-muted">{label}</dt>
      </Tooltip>
      <dd className="min-w-0 flex-1 break-words text-editorial-ink">{value}</dd>
    </div>
  );
}
