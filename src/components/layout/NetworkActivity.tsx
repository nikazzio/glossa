import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { Tooltip } from '../ui';
import { useNetworkActivity } from '../../services/networkActivity';

/** Ogni quanto si riscrive «quanto tempo fa»: al secondo, come un orologio. */
const TICK_MS = 1_000;

/** Oltre questo silenzio la biblioteca non sta più rispondendo a niente. */
const STALE_AFTER_MS = 20_000;

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} kB/s`;
  return `${bytesPerSecond} B/s`;
}

/**
 * Lo stato vero della rete verso le biblioteche.
 *
 * Un lavoro lento e un lavoro piantato si vedono uguali: qui si distinguono,
 * perché si legge quante richieste sono in volo, quante aspettano il turno, con
 * chi si sta parlando e quanti secondi fa è arrivata l'ultima risposta.
 * Compare solo quando c'è qualcosa da dire.
 */
export function NetworkActivity() {
  const { t } = useTranslation();
  const active = useNetworkActivity((state) => state.active);
  const queued = useNetworkActivity((state) => state.queued);
  const lastHost = useNetworkActivity((state) => state.lastHost);
  const lastOkAt = useNetworkActivity((state) => state.lastOkAt);
  const lastErrorAt = useNetworkActivity((state) => state.lastErrorAt);
  const lastErrorMessage = useNetworkActivity((state) => state.lastErrorMessage);
  const speed = useNetworkActivity((state) => state.speed);
  const [now, setNow] = useState(() => Date.now());

  const busy = active + queued > 0;
  const hasHistory = lastOkAt !== null;
  useEffect(() => {
    // L'orologio gira solo mentre c'è traffico: fuori dalla Biblioteca la barra
    // non deve svegliarsi ogni secondo per non dire niente.
    if (!busy && !hasHistory) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [busy, hasHistory]);

  if (!busy && lastOkAt === null && lastErrorAt === null) return null;

  const sinceOk = lastOkAt === null ? null : Math.round((now - lastOkAt) / 1000);
  const failing = lastErrorAt !== null && (lastOkAt === null || lastErrorAt > lastOkAt);
  const stale = busy && (lastOkAt === null || now - lastOkAt > STALE_AFTER_MS);
  const bytesPerSecond = speed();

  const tone = failing
    ? 'text-editorial-danger'
    : stale
      ? 'text-editorial-warning'
      : busy
        ? 'text-editorial-ink'
        : 'text-editorial-muted';

  const detail = [
    t('statusBar.network.inFlight', { count: active }),
    t('statusBar.network.queued', { count: queued }),
    lastHost ? t('statusBar.network.host', { host: lastHost }) : null,
    bytesPerSecond > 0 ? t('statusBar.network.speed', { speed: formatSpeed(bytesPerSecond) }) : null,
    sinceOk === null
      ? t('statusBar.network.noAnswerYet')
      : t('statusBar.network.lastAnswer', { seconds: sinceOk }),
    failing && lastErrorMessage ? t('statusBar.network.lastError', { message: lastErrorMessage }) : null,
  ]
    .filter((line): line is string => line !== null)
    .join(' · ');

  return (
    <Tooltip label={detail} side="top">
      <span className={`flex items-center gap-1 ${tone}`} aria-label={t('statusBar.network.label')}>
        <Activity size={11} className={busy && !stale ? 'animate-pulse' : undefined} />
        <span className="tabular-nums">
          {busy ? active + queued : bytesPerSecond > 0 ? formatSpeed(bytesPerSecond) : '—'}
        </span>
      </span>
    </Tooltip>
  );
}
