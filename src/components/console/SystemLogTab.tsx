import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LOG_LEVELS, readAppLog, type LogLevel, type LogLine } from '../../services/appLogService';
import { errorMessage, logger } from '../../utils/logger';
import { useUiStore } from '../../stores/uiStore';
import { Tooltip } from '../ui';
import { ConsoleChrome } from './ConsoleChrome';
import { ConsoleToolbar, type ConsoleFilterGroup } from './ConsoleToolbar';
import { LOG_FILTER_KEYS, areaOf, prefixesFor, type LogFilterKey } from './logAreas';

/** Quante righe si chiedono per volta. Il file corrente arriva a 5 MB: si
 *  legge dalla fine e ci si ferma appena il tratto è pieno. */
const PAGE_SIZE = 200;

const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'text-terminal-error',
  WARN: 'text-terminal-warn',
  INFO: 'text-terminal-info',
  DEBUG: 'text-terminal-secondary',
};

export function SystemLogTab({ panelId, labelledBy }: { panelId: string; labelledBy: string }) {
  const { t } = useTranslation();
  const areas = useUiStore((state) => state.systemLogAreas);
  const levels = useUiStore((state) => state.systemLogLevels);
  const setAreas = useUiStore((state) => state.setSystemLogAreas);
  const setLevels = useUiStore((state) => state.setSystemLogLevels);

  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const areaSet = useMemo(() => new Set(areas), [areas]);
  const levelSet = useMemo(() => new Set(levels), [levels]);

  const load = useCallback(
    async (skip: number) => {
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
        setLines((previous) => (skip === 0 ? batch : [...previous, ...batch]));
        setExhausted(batch.length < PAGE_SIZE);
        setFailed(false);
      } catch (error) {
        // Il motivo tecnico resta nel log, a schermo va un testo fisso: la
        // console non può diventare l'unico posto dove si legge un guasto
        // della console stessa.
        logger.error('appLog.readFailed', { reason: errorMessage(error) });
        setFailed(true);
      } finally {
        setLoading(false);
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
      <ConsoleChrome title={t('systemLog.title')} rowCount={lines.length} />
      <ConsoleToolbar
        search={search}
        onSearchChange={setSearch}
        groups={groups}
        actions={
          <>
            <Tooltip label={t('systemLog.reload')} side="top">
              <button
                type="button"
                onClick={() => void load(0)}
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
                onClick={() => {
                  setLines([]);
                  setExhausted(true);
                }}
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
        {!failed && lines.length === 0 && !loading && (
          <p className="py-6 text-center text-terminal-secondary">{t('systemLog.empty')}</p>
        )}
        {lines.map((line, index) => (
          <div key={`${line.timestamp}-${index}`} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-terminal-dim">{line.timestamp.slice(11)}</span>
            <span className="shrink-0 text-terminal-secondary">{t(`systemLog.area.${areaOf(line.target)}`)}</span>
            <span className={`shrink-0 ${LEVEL_COLOR[line.level] ?? 'text-terminal-secondary'}`}>
              {line.level}
            </span>
            <span className="min-w-0 break-all text-terminal-ink">{line.message}</span>
          </div>
        ))}
        {!failed && !exhausted && lines.length > 0 && (
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
