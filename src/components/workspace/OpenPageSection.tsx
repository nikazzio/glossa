import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, HardDriveDownload, Loader2, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, SectionLabel, Spinner, StatRow } from '../ui';
import { keepViewerPage } from '../../services/cacheService';
import { excludePage, includePage } from '../../services/excludedPagesService';
import { MAX_SIZE, pageSourceUrl } from '../../services/iiifViewerService';
import { forgetPage, pageLocalCopies, type PageCopy } from '../../services/vaultService';
import { resolutionLabel } from '../../utils/resolutionLabel';
import { humanSize } from '../../utils';
import { errorMessage, logger } from '../../utils/logger';
import type { LibrarySourceVersion } from '../../types';

/** Quale comando sta girando: uno per volta, e si vede quale. */
type PageCommand = 'keep' | 'max' | 'book';

/** La pagina che il visore sta mostrando di questa copia. */
export interface ShownPage {
  index: number;
  imageUrl: string | null;
  imageService: string;
  presentation2: boolean;
}

/**
 * Cosa si può fare con la pagina aperta nel visore.
 *
 * Sta qui e non nella barra del visore perché è una manovra sul deposito, come
 * scaricare il libro o liberare una misura: la barra resta per la lettura. I
 * comandi sono icone con il nome al passaggio del mouse, e restano al loro
 * posto anche quando non c'è una pagina aperta — spenti, senza spiegazioni
 * scritte: una riga che dice «non stai leggendo questa copia» è rumore, perché
 * lo si vede.
 */
export function OpenPageSection({
  version,
  providerKey,
  shownPage,
  bookSize,
  sizeCap,
  onChanged,
}: {
  version: LibrarySourceVersion;
  providerKey: string;
  /** Nulla quando il visore mostra un'altra copia, o nessuna. */
  shownPage: ShownPage | null;
  /** La risoluzione delle pagine già sul disco, quando ce ne sono. */
  bookSize: string | null;
  /** La risoluzione scelta per questa copia: vale anche prima di scaricare il
   *  libro, ed è la cartella in cui finisce una pagina presa da sola. */
  sizeCap: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [copies, setCopies] = useState<PageCopy[]>([]);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState<PageCommand | null>(null);
  /** Quale misura sta eliminando: comando per riga, non per l'intera pagina. */
  const [removingSizeTag, setRemovingSizeTag] = useState<string | null>(null);
  const pageIndex = shownPage?.index ?? null;

  // Una richiesta lenta per la pagina di prima non deve scrivere sopra quella
  // vera della pagina corrente: si cambia pagina rapidamente prima che la
  // prima richiesta torni, e le due possono rispondere fuori ordine.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (pageIndex === null) {
      setCopies([]);
      return;
    }
    setReading(true);
    try {
      const result = await pageLocalCopies(providerKey, version.id, pageIndex);
      if (id !== requestId.current) return;
      setCopies(result);
    } catch (error) {
      if (id !== requestId.current) return;
      logger.warn('library.page.copiesFailed', { reason: errorMessage(error) });
      setCopies([]);
    } finally {
      if (id === requestId.current) setReading(false);
    }
  }, [providerKey, version.id, pageIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ogni comando gira con il suo segno di attività: sono richieste singole
   *  alla biblioteca, non lavori in coda, ma senza un ritorno visibile si
   *  preme due volte. */
  const act = async (command: PageCommand, work: () => Promise<void>) => {
    setRunning(command);
    try {
      await work();
      await load();
      onChanged();
    } catch (error) {
      logger.error('library.page.actionFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.pageActionFailed'));
    } finally {
      setRunning(null);
    }
  };

  /** Elimina **una sola misura** della pagina, non tutte insieme: `forgetPage`
   *  senza misura le cancella tutte, ed è esattamente quello che una riga
   *  singola non deve fare. */
  const removeCopy = async (sizeTag: string) => {
    if (!shownPage) return;
    setRemovingSizeTag(sizeTag);
    try {
      await forgetPage(providerKey, version.id, shownPage.index, sizeTag);
      // Esclusa solo quando non ne resta più nessuna: un libro con due misure
      // sulla stessa pagina non deve smettere di riscaricarla finché non se ne
      // va anche l'ultima.
      if (copies.length <= 1) await excludePage(version.id, shownPage.index);
      await load();
      onChanged();
    } catch (error) {
      logger.error('library.page.actionFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.pageActionFailed'));
    } finally {
      setRemovingSizeTag(null);
    }
  };

  /**
   * Riprende la pagina alla misura chiesta e la **sostituisce** nella copia.
   *
   * La cartella resta quella del libro: di una pagina si tiene un file solo, e
   * la misura chiesta cambia solo cosa si domanda alla biblioteca. I pixel veri
   * restano scritti nella riga di lato, che è l'unica cosa che poi dice quanto
   * misura davvero quella pagina.
   */
  const keepAt = async (requested: string) => {
    if (!shownPage) return;
    await keepViewerPage({
      kind: 'page',
      versionId: version.id,
      index: shownPage.index,
      size: targetSize,
      remoteUrl: pageSourceUrl(shownPage.imageService, requested, shownPage.presentation2),
      providerKey,
    });
    // Riammessa solo a scaricamento riuscito: se la biblioteca non risponde, la
    // pagina non torna davvero e non deve nemmeno sembrare rientrata — uno
    // scaricamento del libro intero, nel frattempo, la salterebbe ancora.
    await includePage(version.id, shownPage.index);
  };

  // "C'è una copia" per abilitare i comandi in alto: quale misura, quando ce
  // n'è più d'una — libri di prima del modello a copia unica — lo dice
  // l'elenco sotto, dove ognuna ha il suo comando di eliminazione.
  const page = copies[0] ?? null;
  // Dove finisce la pagina: nella cartella delle pagine già scaricate, o — se
  // il libro non è ancora sul disco — in quella della risoluzione scelta.
  // Scaricare una pagina sola mentre si legge online deve funzionare.
  const targetSize = bookSize ?? sizeCap;
  // Il libro è già alla risoluzione massima: chiedere «massima» e «quella del
  // libro» sarebbero la stessa richiesta, e uno dei due comandi mentirebbe.
  const bookAtMax = bookSize === MAX_SIZE;
  const above = bookPixels(bookSize);
  const pageAboveBook =
    page?.pixels != null && above !== null ? Math.max(...page.pixels) > above : false;
  const idle = shownPage === null || running !== null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel
          icon={FileText}
          label={
            shownPage
              ? t('areas.library.openPageSection', { page: shownPage.index + 1 })
              : t('areas.library.openPageSectionIdle')
          }
        />
        <span className="flex shrink-0 items-center gap-1">
          <IconButton
            size="sm"
            disabled={idle || page !== null}
            title={t('areas.library.pageKeep')}
            onClick={() => void act('keep', () => keepAt(targetSize))}
          >
            {running === 'keep' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <HardDriveDownload size={13} />
            )}
          </IconButton>
          <IconButton
            size="sm"
            disabled={idle || bookAtMax || pageAboveBook}
            title={t('areas.library.pageTakeAtMax')}
            onClick={() => void act('max', () => keepAt(MAX_SIZE))}
          >
            {running === 'max' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Maximize2 size={13} />
            )}
          </IconButton>
          <IconButton
            size="sm"
            disabled={idle || bookAtMax || !pageAboveBook}
            title={t('areas.library.pageBackToBookSize')}
            onClick={() => void act('book', () => keepAt(targetSize))}
          >
            {running === 'book' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Minimize2 size={13} />
            )}
          </IconButton>
        </span>
      </div>

      {reading ? (
        <Spinner size={12} className="flex items-center gap-2 text-xs text-editorial-muted" />
      ) : (
        copies.length > 0 && (
          // Una copia normale ha una misura sola; un libro di prima del
          // modello a copia unica può averne ancora più d'una sul disco. Ogni
          // riga ha il suo comando di eliminazione, mirato a quella misura: un
          // solo comando che le cancellasse tutte insieme confonderebbe le due
          // situazioni.
          <div className="space-y-2">
            {copies.map((copy) => (
              <div key={`${copy.sizeTag}-${copy.derived ? 'derived' : 'native'}`} className="flex items-center justify-between gap-2">
                <dl className="min-w-0 flex-1 space-y-1 pl-0.5">
                  <StatRow
                    label={t('areas.library.pageSizeField')}
                    value={
                      copy.pixels
                        ? t('areas.library.pagePixels', {
                            width: copy.pixels[0],
                            height: copy.pixels[1],
                          })
                        : resolutionLabel(copy.sizeTag, t)
                    }
                  />
                  <StatRow label={t('areas.library.localVersionSpace')} value={humanSize(copy.bytes)} />
                </dl>
                <IconButton
                  size="sm"
                  tone="danger"
                  disabled={running !== null || removingSizeTag !== null}
                  title={t('areas.library.pageRemove')}
                  onClick={() => void removeCopy(copy.sizeTag)}
                >
                  {removingSizeTag === copy.sizeTag ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </IconButton>
              </div>
            ))}
          </div>
        )
      )}
    </section>
  );
}

/** Il lato lungo che il libro dichiara, quando è un numero: «max» non lo è, e
 *  allora non c'è niente da confrontare. */
function bookPixels(bookSize: string | null): number | null {
  if (!bookSize || bookSize === MAX_SIZE) return null;
  const value = Number(bookSize);
  return Number.isFinite(value) ? value : null;
}
