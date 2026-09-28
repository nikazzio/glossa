import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Braces, RotateCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LOG_LEVELS, readAppLog, type LogLevel, type LogLine } from '../../services/appLogService';
import { errorMessage, logger } from '../../utils/logger';
import { useUiStore } from '../../stores/uiStore';
import { Tooltip } from '../ui';
import { ConsoleChrome } from './ConsoleChrome';
import { ConsoleToolbar, type ConsoleFilterGroup } from './ConsoleToolbar';
import { LOG_FILTER_KEYS, areaOf, prefixesFor, type LogFilterKey } from './logAreas';
import { tokenizeLogMessage, type LogTokenKind } from './logMessageTokens';

/** Quante righe si chiedono per volta. Il file corrente arriva a 5 MB: si
 *  legge dalla fine e ci si ferma appena il tratto è pieno. */
const PAGE_SIZE = 200;

/** Ogni quanto si rilegge il file mentre la scheda è aperta. */
const LIVE_REFRESH_MS = 2000;

const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'text-terminal-error',
  WARN: 'text-terminal-warn',
  INFO: 'text-terminal-info',
  DEBUG: 'text-terminal-secondary',
};

const TOKEN_COLOR: Record<LogTokenKind, string> = {
  text: 'text-terminal-ink',
  key: 'text-terminal-info',
  string: 'text-terminal-success',
  number: 'text-terminal-accent',
  literal: 'text-terminal-error',
  punctuation: 'text-terminal-secondary',
};

const lineIdentity = (line: LogLine) => `${line.timestamp}|${line.target}|${line.level}|${line.message}`;

/**
 * Le righe di `batch` più nuove di quelle già mostrate. `batch` è l'ultima
 * pagina del file: dal confine in poi deve ricalcare, fino al suo fondo, le
 * righe in cima a `shown`. Cercare solo la prima riga uguale scambiava per già
 * vista la seconda di due righe identiche nello stesso secondo. Nessuna
 * sovrapposizione: sono tutte nuove.
 */
function newerLines(batch: LogLine[], shown: LogLine[]): LogLine[] {
  if (shown.length === 0) return batch;
  const shownIds = shown.map(lineIdentity);
  const batchIds = batch.map(lineIdentity);
  for (let start = 0; start < batchIds.length; start += 1) {
    const rest = batchIds.length - start;
    if (rest > shownIds.length) continue;
    if (batchIds.slice(start).every((id, offset) => id === shownIds[offset])) return batch.slice(0, start);
  }
  return batch;
}

/** Chiavi stabili quando le righe arrivano in cima: l'identità della riga più
 *  un contatore per quelle identiche nello stesso secondo. */
function lineKeys(lines: LogLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const identity = lineIdentity(line);
    const count = seen.get(identity) ?? 0;
    seen.set(identity, count + 1);
    return `${identity}#${count}`;
  });
}

function LogMessage({ message, highlight }: { message: string; highlight: boolean }) {
  if (!highlight) return <span className="min-w-0 break-all text-terminal-ink">{message}</span>;
  return (
    <span className="min-w-0 break-all">
      {tokenizeLogMessage(message).map((token, index) => (
        <span key={index} className={TOKEN_COLOR[token.kind]}>
          {token.value}
        </span>
      ))}
    </span>
  );
}

export function SystemLogTab({ panelId, labelledBy }: { panelId: string; labelledBy: string }) {
  const { t } = useTranslation();
  const areas = useUiStore((state) => state.systemLogAreas);
  const levels = useUiStore((state) => state.systemLogLevels);
  const setAreas = useUiStore((state) => state.setSystemLogAreas);
  const setLevels = useUiStore((state) => state.setSystemLogLevels);
  const highlightData = useUiStore((state) => state.systemLogHighlightData);
  const setHighlightData = useUiStore((state) => state.setSystemLogHighlightData);

  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  // «Svuota la vista» nasconde quello che c'era fino a quel momento; le righe
  // che arrivano dopo continuano a comparire. Il confine è la riga stessa, non
  // l'orario: le righe arrivate nello stesso secondo devono restare visibili.
  const [clearedLine, setClearedLine] = useState<LogLine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshingRef = useRef(false);
  const loadingRef = useRef(false);
  // Cresce a ogni lettura voluta dall'utente: una rilettura partita prima,
  // con altri filtri o prima di «carica le precedenti», arriva scaduta.
  const generationRef = useRef(0);
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);

  const areaSet = useMemo(() => new Set(areas), [areas]);
  const levelSet = useMemo(() => new Set(levels), [levels]);

  const load = useCallback(
    async (skip: number) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const batch = await readAppLog({
          limit: PAGE_SIZE,
          skip,
          levels,
          query: search.trim() || undefined,
          includeDependencies: areaSet.has('dependencies'),
          targetPrefixes: prefixesFor(areaSet),
        });
        // Una lettura superata da un'altra (filtri cambiati mentre era in
        // volo) non deve sovrascrivere quella giusta.
        if (generation !== generationRef.current) return;
        if (skip === 0) setClearedLine(null);
        setLines((previous) => (skip === 0 ? batch : [...previous, ...batch]));
        setExhausted(batch.length < PAGE_SIZE);
        setFailed(false);
      } catch (error) {
        // Il motivo tecnico resta nel log, a schermo va un testo fisso: la
        // console non può diventare l'unico posto dove si legge un guasto
        // della console stessa.
        if (generation !== generationRef.current) return;
        logger.error('appLog.readFailed', { reason: errorMessage(error) });
        setFailed(true);
      } finally {
        if (generation === generationRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [areaSet, levels, search],
  );

  // Ogni cambio di filtro riparte dalla riga più recente: continuare a
  // scorrere all'indietro con filtri diversi mescolerebbe due letture.
  useEffect(() => {
    void load(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [load]);

  // Rilettura in tempo reale: l'ultima pagina, dalla riga più recente, e in
  // cima si aggiungono solo le righe più nuove di quelle già a schermo. Il
  // resto dell'elenco non si tocca, così restano le pagine caricate a mano e
  // chi legge più in basso non perde il segno. Un errore qui resta silenzioso a
  // schermo — ci pensa la prossima rilettura — ma finisce nel log.
  const refresh = useCallback(async () => {
    if (refreshingRef.current || loadingRef.current) return;
    refreshingRef.current = true;
    const generation = generationRef.current;
    try {
      const batch = await readAppLog({
        limit: PAGE_SIZE,
        skip: 0,
        levels,
        query: search.trim() || undefined,
        includeDependencies: areaSet.has('dependencies'),
        targetPrefixes: prefixesFor(areaSet),
      });
      if (generation !== generationRef.current) return;
      setFailed(false);
      setLines((previous) => {
        const newer = newerLines(batch, previous);
        if (newer.length === 0) return previous;
        const container = scrollRef.current;
        scrollAnchorRef.current = container ? { height: container.scrollHeight, top: container.scrollTop } : null;
        return [...newer, ...previous];
      });
    } catch (error) {
      logger.error('appLog.refreshFailed', { reason: errorMessage(error) });
    } finally {
      refreshingRef.current = false;
    }
  }, [areaSet, levels, search]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Chi sta leggendo più in basso non deve vedersi spostare le righe sotto
  // gli occhi quando in cima ne arrivano di nuove.
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const container = scrollRef.current;
    scrollAnchorRef.current = null;
    if (!anchor || !container || anchor.top === 0) return;
    container.scrollTop = anchor.top + (container.scrollHeight - anchor.height);
  }, [lines]);

  const clearedIndex = clearedLine === null ? -1 : lines.indexOf(clearedLine);
  const visibleLines = clearedIndex < 0 ? lines : lines.slice(0, clearedIndex);
  const visibleKeys = lineKeys(visibleLines);

  const toggleArea = (value: string) => {
    const key = value as LogFilterKey;
    setAreas(areas.includes(key) ? areas.filter((area) => area !== key) : [...areas, key]);
  };
  const toggleLevel = (value: string) => {
    const level = value as LogLevel;
    setLevels(levels.includes(level) ? levels.filter((entry) => entry !== level) : [...levels, level]);
  };

  const groups: ConsoleFilterGroup[] = [
    {
      key: 'areas',
      onToggle: toggleArea,
      options: LOG_FILTER_KEYS.map((key) => ({
        value: key,
        label: t(`systemLog.area.${key}`),
        active: areaSet.has(key),
      })),
    },
    {
      key: 'levels',
      onToggle: toggleLevel,
      options: LOG_LEVELS.map((level) => ({
        value: level,
        label: t(`systemLog.level.${level}`),
        active: levelSet.has(level),
        activeClassName: LEVEL_COLOR[level],
      })),
    },
  ];

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="flex h-full flex-col bg-terminal-bg"
    >
      <ConsoleChrome title={t('systemLog.title')} rowCount={visibleLines.length} />
      <ConsoleToolbar
        search={search}
        onSearchChange={setSearch}
        groups={groups}
        actions={
          <>
            <Tooltip label={t('systemLog.highlightData')} side="top">
              <button
                type="button"
                onClick={() => setHighlightData(!highlightData)}
                aria-label={t('systemLog.highlightData')}
                aria-pressed={highlightData}
                className={`shrink-0 transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent ${
                  highlightData ? 'text-terminal-accent' : 'text-terminal-secondary'
                }`}
              >
                <Braces size={14} />
              </button>
            </Tooltip>
            <Tooltip label={t('systemLog.reload')} side="top">
              <button
                type="button"
                onClick={() => {
                  setClearedLine(null);
                  void load(0);
                }}
                aria-label={t('systemLog.reload')}
                className="shrink-0 text-terminal-secondary transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"
              >
                <RotateCw size={14} />
              </button>
            </Tooltip>
            {/* Svuota solo quello che si vede: il file su disco non si tocca,
                e ricaricando le righe tornano tutte. */}
            <Tooltip label={t('systemLog.clearView')} side="top">
              <button
                type="button"
                onClick={() => setClearedLine(lines[0] ?? null)}
                aria-label={t('systemLog.clearView')}
                className="shrink-0 text-terminal-secondary transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          </>
        }
      />

      <div ref={scrollRef} className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
        {failed && (
          <p role="alert" className="py-6 text-center text-terminal-error">
            {t('systemLog.readFailed')}
          </p>
        )}
        {!failed && visibleLines.length === 0 && !loading && (
          <p className="py-6 text-center text-terminal-secondary">{t('systemLog.empty')}</p>
        )}
        {visibleLines.map((line, index) => (
          <div key={visibleKeys[index]} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-terminal-dim">{line.timestamp.slice(11)}</span>
            <span className="shrink-0 text-terminal-secondary">{t(`systemLog.area.${areaOf(line.target)}`)}</span>
            <span className={`shrink-0 ${LEVEL_COLOR[line.level] ?? 'text-terminal-secondary'}`}>
              {line.level}
            </span>
            <LogMessage message={line.message} highlight={highlightData} />
          </div>
        ))}
        {!failed && !exhausted && visibleLines.length > 0 && clearedIndex < 0 && (
          <div className="flex justify-center py-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(lines.length)}
              className="text-xs uppercase tracking-[0.14em] text-terminal-secondary transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent disabled:text-terminal-dim"
            >
              {loading ? t('systemLog.loading') : t('systemLog.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
