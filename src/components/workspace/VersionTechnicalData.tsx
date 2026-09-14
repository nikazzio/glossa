import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyButton, IconLink } from '../ui';
import { readManifestText } from '../../services/iiifProviderService';
import { libraryItemUrl, libraryPageUrl } from '../../services/libraryLinks';
import { providerSiteUrl } from '../library/ProviderSiteLink';
import { errorMessage, logger } from '../../utils/logger';
import type { IIIFProvider, LibrarySourceDetail, LibrarySourceVersion } from '../../types';

/** La pagina che il visore sta mostrando, quando è di questa copia. */
export interface ShownPage {
  index: number;
  imageUrl: string | null;
}

/**
 * Tutto quello che di questa copia è un indirizzo, più il manifesto per esteso.
 *
 * Gli indirizzi erano sparsi: il manifesto qui, la pagina della biblioteca in
 * cima alla scheda, l'immagine in nessun posto. Chi lavora con i manifesti li
 * vuole tutti insieme, copiabili, e vuole poter leggere quello che la
 * biblioteca dichiara invece di dedurlo da come il visore lo mostra. Carattere
 * piccolo e sezione chiusa: è materiale da consultare, non da leggere sempre.
 */
export function VersionTechnicalData({ version, detail, provider, shownPage }: {
  version: LibrarySourceVersion;
  detail: LibrarySourceDetail;
  provider?: IIIFProvider;
  shownPage?: ShownPage | null;
}) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<string | null>(null);
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
      const text = await readManifestText(providerKey, version.sourceUrl);
      // Rientrato: un manifesto su una riga sola non si legge, e il documento
      // che arriva dalla biblioteca è quasi sempre compattato.
      setManifest(JSON.stringify(JSON.parse(text), null, 2));
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
    <details className="border-t border-editorial-border/70 pt-2">
      <summary className="cursor-pointer text-xs font-semibold text-editorial-muted">
        {t('areas.library.technicalData')}
      </summary>

      <dl className="mt-2 space-y-1.5">
        {shown.map((link) => (
          <div key={link.key} className="flex items-start gap-1.5">
            <dt className="w-28 shrink-0 text-xs uppercase leading-5 tracking-[0.08em] text-editorial-muted">
              {t(`areas.library.technicalLinks.${link.key}`)}
            </dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-editorial-ink">
                {link.url}
              </span>
              <CopyButton text={link.url} size="xs" />
              <IconLink
                size="xs"
                href={link.url}
                title={t('areas.library.technicalLinkOpen')}
                tooltipSide="left"
              >
                <ExternalLink size={12} />
              </IconLink>
            </dd>
          </div>
        ))}
      </dl>

      {version.sourceUrl && providerKey && (
        <div className="mt-3 border-t border-editorial-border/70 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadManifest()}
              disabled={loading || Boolean(manifest)}
              className="text-xs uppercase tracking-[0.12em] text-editorial-muted transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:text-editorial-muted/50"
            >
              {t('areas.library.manifestContent')}
            </button>
            {loading && <Loader2 size={12} className="animate-spin text-editorial-muted" aria-hidden="true" />}
            {manifest && <CopyButton text={manifest} size="xs" />}
          </div>
          {failed && (
            <p role="alert" className="mt-1 text-xs text-editorial-danger">
              {t('areas.library.manifestContentFailed')}
            </p>
          )}
          {manifest && (
            <pre className="custom-scrollbar mt-2 max-h-80 overflow-auto rounded border border-editorial-border/70 bg-editorial-textbox p-2 font-mono text-xs leading-5 text-editorial-ink">
              {manifest}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}
