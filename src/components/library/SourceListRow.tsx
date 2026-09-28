import { type ReactNode, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenText, BookPlus, Check, ChevronDown, FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Hint, IconButton, Spinner, StatBlock } from '../ui';
import { isManifest, type SourceCard } from '../../types';
import { EASE_EDITORIAL, MOTION_DURATION } from '../layout/motion';
import { CachedThumbnail } from '../common/CachedThumbnail';
import { WorkIdentity } from '../common/WorkIdentity';
import { useManifestFacts } from '../../hooks/useManifestFacts';
import { useSeenOnce } from '../../hooks/useSeenOnce';
import { explainMatch, highlightTerms } from '../../utils/searchMatch';

/**
 * I motivi per cui una ricerca non riesce, come li dichiara il motore.
 *
 * Sono codici e non frasi perché la stessa causa va detta nella lingua di chi
 * legge, e perché portano a decisioni diverse: un rifiuto automatico non si
 * risolve riprovando, un limite di velocità sì, un servizio spento si riprova
 * più tardi.
 */
export const SEARCH_ERRORS: Record<string, string> = {
  search_refused: 'dashboard.discovery.errorRefused',
  search_rate_limited: 'dashboard.discovery.errorRateLimited',
  search_unavailable: 'dashboard.discovery.errorUnavailable',
  search_unreachable: 'dashboard.discovery.errorUnreachable',
  search_invalid_data: 'dashboard.discovery.errorInvalidData',
  search_failed: 'dashboard.discovery.searchFailed',
  search_key_missing: 'dashboard.discovery.errorKeyMissing',
  manifest_unreachable: 'dashboard.discovery.errorManifestUnreachable',
  manifest_unreadable: 'dashboard.discovery.errorManifestUnreadable',
  manifest_invalid: 'dashboard.discovery.errorManifestInvalid',
  'federation.staleExecution': 'federation.staleExecution',
};

interface CardActionsProps {
  adding: boolean;
  alreadyAdded: boolean;
  onAddToLibrary: () => void;
  onAddToWorkspace: () => void;
}

function CardActions({ adding, alreadyAdded, onAddToLibrary, onAddToWorkspace }: CardActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton
        title={alreadyAdded ? t('dashboard.discovery.alreadyInLibrary') : t('dashboard.discovery.addToLibrary')}
        onClick={onAddToLibrary}
        disabled={adding || alreadyAdded}
        size="sm"
        tone={alreadyAdded ? 'success' : 'default'}
      >
        {adding ? <Spinner size={14} /> : alreadyAdded ? <Check size={14} /> : <BookPlus size={14} />}
      </IconButton>
      <IconButton
        title={t('dashboard.discovery.addToWorkspace')}
        onClick={onAddToWorkspace}
        disabled={adding}
        size="sm"
      >
        <FolderPlus size={14} />
      </IconButton>
    </div>
  );
}

interface RowProps {
  card: SourceCard;
  providerKey: string;
  providerLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onAddToLibrary: () => void;
  onAddToWorkspace: () => void;
  adding: boolean;
  alreadyAdded: boolean;
  /** Quello che la riga dice in più quando la ricerca interroga più fonti:
   *  quante copie della stessa opera sono arrivate e da quali biblioteche. */
  note?: string;
  /** La scelta fra le copie della stessa opera, nella riga aperta. */
  copyPicker?: ReactNode;
  /** Le parole cercate: la riga dice dove sono state trovate. */
  matchTerms?: string[];
}

/** Le sezioni che l'app riconosce da sé; quelle dichiarate dalla biblioteca
 *  si mostrano col loro nome. */
const LOCAL_SECTIONS = new Set(['author', 'title', 'publisher', 'contributors', 'subjects', 'description', 'record']);

/**
 * «Trovato in …»: dove sono le parole cercate, con le parole in grassetto. Senza
 * questa riga un risultato uscito per una parola nel testo delle pagine, o in
 * una bibliografia, non si capisce perché ci sia.
 */
function MatchLine({ card, providerKey, terms }: { card: SourceCard; providerKey: string; terms: string[] }) {
  const { t } = useTranslation();
  const explanation = useMemo(() => (isManifest(card) ? null : explainMatch(card, terms)), [card, terms]);
  if (!explanation) return null;
  if (explanation.kind === 'elsewhere') {
    return (
      <p className="mt-0.5 text-xs italic text-editorial-muted">
        {providerKey === 'gallica' ? t('federation.match.pageText') : t('federation.match.elsewhere')}
      </p>
    );
  }
  const section = LOCAL_SECTIONS.has(explanation.section) ? t(`federation.match.section.${explanation.section}`) : explanation.section;
  return (
    <p className="mt-0.5 line-clamp-2 text-xs text-editorial-muted">
      <span>{t('federation.match.foundIn', { section })}</span>
      {explanation.text && (
        <>
          {' — '}
          {highlightTerms(explanation.text, terms).map((segment, index) =>
            segment.match
              ? <strong key={index} className="font-semibold text-editorial-ink">{segment.text}</strong>
              : <span key={index}>{segment.text}</span>)}
        </>
      )}
    </p>
  );
}

/** Tutte le informazioni disponibili per una scheda, etichetta/valore. */
function sourceStats(
  card: SourceCard,
  t: (key: string) => string,
  { includeCatalogUrl = true }: { includeCatalogUrl?: boolean } = {},
): Array<[string, string]> {
  return [
    card.creator && [t('dashboard.discovery.by'), card.creator],
    !isManifest(card) && card.contributors.length > 0 && [t('dashboard.discovery.contributors'), card.contributors.join(' · ')],
    card.date && [t('dashboard.discovery.published'), card.date],
    !isManifest(card) && card.publisher && [t('dashboard.discovery.publisher'), card.publisher],
    card.language && [t('dashboard.discovery.language'), card.language],
    card.volume && [t('dashboard.discovery.volume'), card.volume],
    !isManifest(card) && card.mediaType && [t('dashboard.discovery.type'), card.mediaType],
    isManifest(card) && card.materialType && [t('dashboard.discovery.type'), card.materialType],
    !isManifest(card) && card.collection && [t('dashboard.discovery.collection'), card.collection],
    card.itemCount !== null && [t('dashboard.discovery.pages'), String(card.itemCount)],
    !isManifest(card) && card.physicalDescription && [t('dashboard.discovery.physicalDescription'), card.physicalDescription],
    card.subjects.length > 0 && [t('dashboard.discovery.subjects'), card.subjects.join(' · ')],
    !isManifest(card) && card.rights.length > 0 && [t('dashboard.discovery.rights'), card.rights.join(' · ')],
    !isManifest(card) && card.holdingInstitution && [t('dashboard.discovery.holdingInstitution'), card.holdingInstitution],
    includeCatalogUrl && !isManifest(card) && card.catalogUrl && [t('dashboard.discovery.catalogUrl'), card.catalogUrl],
  ].filter((entry): entry is [string, string] => Boolean(entry));
}

// Piccola quando chiusa, più grande e leggibile quando la riga è aperta —
// stessa immagine, solo la cornice cambia dimensione. Larghezza esposta a
// parte perché la colonna di allineamento sotto il titolo (vedi in basso)
// deve restare identica senza ricalcolarla dalla stringa di classi.
const THUMBNAIL_WIDTH_EXPANDED = 'w-24';
const THUMBNAIL_SIZE = {
  closed: 'h-16 w-12',
  expanded: `h-32 ${THUMBNAIL_WIDTH_EXPANDED}`,
};

/**
 * Il segno di un risultato che non si apre, o che si sta controllando.
 *
 * Un esito negativo **segna la riga, non la nasconde**: la scheda esiste e può
 * servire, quello che manca è la riproduzione. E si scrive solo quando la
 * biblioteca lo dichiara: un servizio fermo non diventa un'opera assente.
 */
function OpenableMark({ openable, checking }: { openable: boolean | null; checking: boolean }) {
  const { t } = useTranslation();
  if (checking) return <span className="shrink-0 italic opacity-70">{t('dashboard.discovery.checking')}</span>;
  if (openable !== false) return null;
  return (
    // L'etichetta porta la spiegazione: premerla la apre, così vale anche per
    // chi non usa il mouse.
    <span className="shrink-0 text-editorial-warning">
      <Hint label={`${t('dashboard.discovery.notOpenable')} — ${t('dashboard.discovery.notOpenableHint')}`}>
        {t('dashboard.discovery.notOpenable')}
      </Hint>
    </span>
  );
}

export function SourceListRow({ card, providerKey, providerLabel, expanded, onToggle, onAddToLibrary, onAddToWorkspace, adding, alreadyAdded, note, copyPicker, matchTerms = [] }: RowProps) {
  const { t } = useTranslation();
  // La riga si controlla solo quando entra nello schermo: un elenco di venti
  // risultati scorso a metà non deve costare venti richieste.
  const { ref: rowRef, seen } = useSeenOnce<HTMLElement>();
  // Una scheda ricavata aprendo direttamente un indirizzo si è già aperta: non
  // c'è niente da controllare.
  const declaredOpenable = isManifest(card) ? true : card.openable;
  // Una lettura sola del manifesto risponde a tutto quello che la riga deve
  // dire e il catalogo non dice: se si apre, quante pagine ha davvero, quanto
  // misura la prima, e se accanto alle immagini c'è un documento da scaricare.
  const { facts, checking } = useManifestFacts(providerKey, card.manifestUrl, declaredOpenable, seen);
  const openable = facts.openable;
  const title = card.title || t('dashboard.discovery.untitled');
  // Il collegamento alla pagina web e quello al catalogo cartaceo sono
  // indirizzi veri: si aprono, non si leggono come le altre etichette.
  const pageUrl = !isManifest(card) ? card.pageUrl : null;
  const catalogUrl = !isManifest(card) ? card.catalogUrl : null;
  // I dati della scheda servono solo a riga aperta: calcolarli sempre significa
  // una quindicina di traduzioni per ogni riga dell'elenco, a ogni disegno.
  const stats = useMemo(
    () => (expanded ? sourceStats(card, t, { includeCatalogUrl: false }) : []),
    [expanded, card, t],
  );
  // Il numero di pagine sta già fra i dati della scheda aperta: nella riga
  // chiusa lo si ripete perché è quello che fa decidere se aprire l'opera.
  // Quando il catalogo non lo dichiara la voce sparisce, senza scrivere zero.
  const pageCount = card.itemCount !== null ? t('dashboard.discovery.pagesCount', { count: card.itemCount }) : null;
  // Da dove viene l'opera: con un aggregatore i risultati arrivano da
  // istituzioni diverse, e saperlo senza aprire la riga evita di controllarle
  // una per una. Senza istituzione dichiarata vale chi ha risposto. Aperta la
  // riga, l'istituzione è già fra i dati della scheda: lì resta chi ha risposto.
  const origin = (expanded ? providerLabel : card.holdingInstitution) || providerLabel;
  // «Bibliothèque nationale de France, département X, 8-K-5072» è istituto,
  // fondo e segnatura in una stringa sola: in riga chiusa vale il primo.
  const shortOrigin = expanded ? origin : origin.split(',')[0].trim();
  // Il PDF si segna solo quando c'è: su ogni riga «PDF non verificato» era
  // rumore. Lo stato completo, assenza compresa, sta nella riga aperta.
  const detailParts = [
    shortOrigin,
    !isManifest(card) ? card.mediaType : null,
    expanded ? null : pageCount,
    facts.document ? t('dashboard.discovery.documentAvailable') : null,
    note,
  ].filter(Boolean) as string[];
  /** Quello che si sa solo leggendo il manifesto, e che il catalogo non dice. */
  const manifestStats = useMemo(
    () =>
      expanded
        ? ([
            facts.pages !== null && [
              t('dashboard.discovery.manifestPages'),
              String(facts.pages),
            ],
            facts.samplePixels && [
              t('dashboard.discovery.samplePixels'),
              `${facts.samplePixels[0]} × ${facts.samplePixels[1]} px`,
            ],
            // Detta sempre, anche quando il PDF non c'è: l'assenza è una
            // risposta, il silenzio no.
            [
              t('dashboard.discovery.documentLabel'),
              checking
                ? t('dashboard.discovery.documentChecking')
                : facts.document
                  ? (facts.document.label ?? t('dashboard.discovery.documentAvailable'))
                  : facts.openable !== null
                    ? t('dashboard.discovery.documentUnavailable')
                    : t('dashboard.discovery.documentUnverified'),
            ],
          ].filter((entry): entry is [string, string] => Boolean(entry)))
        : [],
    [expanded, facts, checking, t],
  );

  return (
    <article
      ref={rowRef}
      className={
        expanded
          ? 'my-1 overflow-hidden rounded-xl border border-editorial-accent/50 bg-surface-elevated shadow-sm'
          : 'overflow-hidden border-b border-editorial-border/70 transition-colors hover:bg-surface-hover/50'
      }
    >
      <div className={`flex gap-3 px-3 py-2.5 ${expanded ? 'items-start' : 'items-center'}`}>
        <div className="flex min-w-0 flex-1 gap-3 text-left">
          <span
            className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-editorial-border bg-editorial-textbox transition-all duration-[180ms] ${
              expanded ? THUMBNAIL_SIZE.expanded : THUMBNAIL_SIZE.closed
            }`}
          >
            <CachedThumbnail
              url={card.thumbnailUrl}
              providerKey={providerKey}
              className="h-full w-full object-cover"
              fallback={<BookOpenText size={expanded ? 20 : 14} className="text-editorial-muted" aria-hidden="true" />}
            />
          </span>
          <span className={`min-w-0 flex-1 ${expanded ? 'pt-0.5' : ''}`}>
            <WorkIdentity
              variant={expanded ? 'full' : 'row'}
              work={{
                title,
                creator: card.creator,
                date: card.date,
                place: null,
                publisher: isManifest(card) ? null : card.publisher,
              }}
              details={
                <>
                  <span className="min-w-0 truncate">{detailParts.join(' · ')}</span>
                  <OpenableMark openable={openable} checking={checking} />
                </>
              }
            />
            <MatchLine card={card} providerKey={providerKey} terms={matchTerms} />
          </span>
        </div>
        <IconButton title={t('federation.details')} aria-expanded={expanded} onClick={onToggle} size="sm"><ChevronDown size={14} className={expanded ? 'rotate-180' : ''} /></IconButton>
        <CardActions adding={adding} alreadyAdded={alreadyAdded} onAddToLibrary={onAddToLibrary} onAddToWorkspace={onAddToWorkspace} />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: MOTION_DURATION, ease: EASE_EDITORIAL }} className="overflow-hidden">
            <div className="flex gap-3 px-3 pb-3">
              {/* Colonna vuota della stessa larghezza della copertina: fa allineare il testo sotto al titolo, non sotto alla copertina. */}
              <span className={`shrink-0 ${THUMBNAIL_WIDTH_EXPANDED}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-3">
                {copyPicker}
                {card.description && <p className="text-sm leading-relaxed text-editorial-ink/80">{card.description}</p>}
                {stats.length > 0 && (
                  <div className="grid grid-cols-1 gap-y-2">
                    {stats.map(([label, value]) => <StatBlock key={label} label={label} value={value} />)}
                  </div>
                )}
                {manifestStats.length > 0 && (
                  <div className="grid grid-cols-1 gap-y-2">
                    {manifestStats.map(([label, value]) => (
                      <StatBlock key={label} label={label} value={value} />
                    ))}
                  </div>
                )}
                {pageUrl && <StatBlock label={t('dashboard.discovery.pageUrl')} value={pageUrl} href={pageUrl} />}
                {catalogUrl && <StatBlock label={t('dashboard.discovery.catalogUrl')} value={catalogUrl} href={catalogUrl} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
