import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadTranscriptionOperationLogs, type PersistedLogEntry } from '../../services/dbService';
import { onJobChanged, OCR_JOB_TYPE } from '../../services/jobsService';
import { Tooltip } from '../ui';
import { ConsoleChrome } from '../console/ConsoleChrome';
import { ConsoleToolbar } from '../console/ConsoleToolbar';
import { usePricingStore } from '../../stores/pricingStore';
import { costForEntry, formatDurationMs } from '../../utils/operationLogStats';

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-terminal-error',
  warn: 'text-terminal-warn',
  success: 'text-terminal-success',
  info: 'text-terminal-info',
};

/** I tipi di riga scritti dal motore di lettura: avvio, immagine inviata,
 *  prompt inviato, esito. Sono anche i filtri della console. */
const PHASES = ['start', 'image', 'prompt', 'end'] as const;
type LogPhase = (typeof PHASES)[number];

const LEVELS = ['info', 'success', 'warn', 'error'] as const;
type LogLevel = (typeof LEVELS)[number];

function phaseOf(entry: PersistedLogEntry): LogPhase {
  return (PHASES as readonly string[]).includes(entry.phase ?? '') ? (entry.phase as LogPhase) : 'end';
}

function pageLabelOf(entry: PersistedLogEntry): string | null {
  const label = (entry.meta as { pageLabel?: unknown } | undefined)?.pageLabel;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}

/** Log trascrizione (#220), speculare al "Log traduzione": una console sopra
 *  `operation_logs` filtrata sul documento aperto, con ricerca, filtri per
 *  tipo di riga e livello, e raggruppamento per pagina. Riuso della cornice e
 *  della barra dei filtri — non di `OperationsTab.tsx`, legato ai frammenti di
 *  traduzione. */
export function TranscriptionLogTab({
  documentId,
  panelId,
  labelledBy,
}: {
  documentId: string;
  panelId: string;
  labelledBy: string;
}) {
  const { t } = useTranslation();
  const pricingOverrides = usePricingStore((state) => state.overrides);
  const [entries, setEntries] = useState<PersistedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<Set<LogPhase>>(new Set(PHASES));
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(new Set(LEVELS));
  const [grouped, setGrouped] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadTranscriptionOperationLogs(documentId);
      setEntries([...rows].reverse());
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  // Ogni cambio di stato di un lavoro di lettura può avere aggiunto righe:
  // anche una pausa o un annullamento, non solo la fine.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onJobChanged((job) => {
      if (job.jobType === OCR_JOB_TYPE) void load();
    }).then((fn) => { if (!cancelled) unlisten = fn; else fn(); });
    return () => { cancelled = true; unlisten?.(); };
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!phaseFilter.has(phaseOf(entry))) return false;
      if (!levelFilter.has((entry.level as LogLevel) ?? 'info')) return false;
      if (!needle) return true;
      return `${entry.message} ${entry.detail ?? ''} ${pageLabelOf(entry) ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [entries, phaseFilter, levelFilter, search]);

  /** Righe raggruppate per pagina, nell'ordine in cui le pagine compaiono. */
  const groups = useMemo(() => {
    const byPage = new Map<string, PersistedLogEntry[]>();
    for (const entry of filtered) {
      const key = pageLabelOf(entry) ?? t('transcription.log.unknownPage');
      const bucket = byPage.get(key);
      if (bucket) bucket.push(entry);
      else byPage.set(key, [entry]);
    }
    return Array.from(byPage.entries());
  }, [filtered, t]);

  const toggle = <T extends string>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex h-full flex-col bg-terminal-bg">
      <ConsoleChrome
        title={t('transcription.log.title')}
        rowCount={filtered.length}
        status={
          <Tooltip label={t('systemLog.reload')} side="top">
            <button
              type="button"
              onClick={() => void load()}
              aria-label={t('systemLog.reload')}
              disabled={loading}
              className="shrink-0 text-terminal-secondary transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent disabled:text-terminal-dim"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : undefined} />
            </button>
          </Tooltip>
        }
      />

      <ConsoleToolbar
        search={search}
        onSearchChange={setSearch}
        groups={[
          {
            key: 'phases',
            onToggle: (value) => setPhaseFilter((prev) => toggle(prev, value as LogPhase)),
            options: PHASES.map((phase) => ({
              value: phase,
              label: t(`transcription.log.phase.${phase}`),
              active: phaseFilter.has(phase),
            })),
          },
          {
            key: 'levels',
            onToggle: (value) => setLevelFilter((prev) => toggle(prev, value as LogLevel)),
            options: LEVELS.map((level) => ({
              value: level,
              label: t(`log.level${level.charAt(0).toUpperCase()}${level.slice(1)}`),
              active: levelFilter.has(level),
              activeClassName: LEVEL_COLOR[level],
            })),
          },
        ]}
        inlineToggles={
          <button
            type="button"
            onClick={() => setGrouped((value) => !value)}
            aria-pressed={grouped}
            className={`shrink-0 text-xs uppercase tracking-[0.14em] transition-colors focus:outline-none ${
              grouped ? 'text-terminal-accent' : 'text-terminal-muted hover:text-terminal-secondary'
            }`}
          >
            {t('log.grouped')}
          </button>
        }
      />

      <div
        ref={scrollRef}
        className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs"
      >
        {filtered.length === 0 && !loading && (
          <p className="py-6 text-center text-terminal-secondary">
            {entries.length > 0 ? t('transcription.log.emptyFiltered') : t('transcription.log.empty')}
          </p>
        )}

        {grouped
          ? groups.map(([page, pageEntries]) => (
              <details key={page} open className="mt-2 first:mt-0">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-2 py-1.5 text-xs uppercase tracking-[0.1em] text-terminal-secondary list-none [&::-webkit-details-marker]:hidden">
                  <span>{t('transcription.log.pageGroup', { page })}</span>
                  <span className="text-terminal-muted">{pageEntries.length}</span>
                </summary>
                <div className="ml-2 space-y-1 border-l border-terminal-line pl-3 pb-1">
                  {pageEntries.map((entry) => (
                    <LogRow key={entry.id} entry={entry} pricingOverrides={pricingOverrides} />
                  ))}
                </div>
              </details>
            ))
          : filtered.map((entry) => (
              <LogRow key={entry.id} entry={entry} pricingOverrides={pricingOverrides} />
            ))}
      </div>
    </div>
  );
}

/** Una riga: intestazione tecnica sopra, messaggio sotto, e — quando c'è — il
 *  testo lungo (il prompt inviato, l'errore esatto) aperto su richiesta. */
function LogRow({
  entry,
  pricingOverrides,
}: {
  entry: PersistedLogEntry;
  pricingOverrides: Record<string, { input: number; output: number }>;
}) {
  const { t } = useTranslation();
  // Il costo non viene congelato alla scrittura come per la traduzione: le
  // righe OCR le scrive Rust, che non conosce il listino. Si applica qui,
  // con la stessa funzione usata dai riepiloghi della traduzione.
  const cost = entry.costUsd ?? costForEntry(entry, pricingOverrides);
  const hasTokens = entry.inputTokens != null || entry.outputTokens != null;

  return (
    <div className="py-1">
      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <span className="select-none text-terminal-dim">$</span>
        <span className="tabular-nums text-terminal-secondary">{entry.at.slice(11, 19)}</span>
        {entry.provider && (
          <span className="text-terminal-secondary">
            {entry.provider}{entry.model ? `:${entry.model}` : ''}
          </span>
        )}
        {entry.durationMs != null && (
          <span className="text-terminal-muted">{formatDurationMs(entry.durationMs)}</span>
        )}
        {hasTokens && (
          <span className="text-terminal-muted tabular-nums">
            {(entry.inputTokens ?? 0).toLocaleString()}→{(entry.outputTokens ?? 0).toLocaleString()}
          </span>
        )}
        {entry.cachedInputTokens != null && entry.cachedInputTokens > 0 && (
          <span className="text-terminal-muted">
            {t('transcription.log.cachedTokens', { count: entry.cachedInputTokens })}
          </span>
        )}
        {cost != null && <span className="text-terminal-muted">${cost.toFixed(4)}</span>}
      </div>
      <p className={`mt-0.5 pl-4 leading-relaxed ${LEVEL_COLOR[entry.level] ?? 'text-terminal-ink'}`}>
        {entry.message}
      </p>
      {entry.detail && entry.detailKind === 'prompt' && (
        <details className="ml-4 mt-1">
          <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.1em] text-terminal-muted hover:text-terminal-accent list-none [&::-webkit-details-marker]:hidden">
            {t('transcription.log.showPrompt')}
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-words border-l border-terminal-line pl-3 text-terminal-secondary">
            {entry.detail}
          </pre>
        </details>
      )}
    </div>
  );
}
