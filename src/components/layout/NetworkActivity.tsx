import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { Tooltip } from '../ui';
import { networkProbe, type NetworkProbe } from '../../services/cacheService';
import { useNetworkActivity } from '../../services/networkActivity';

/** Ogni quanto si richiede al motore lo stato delle corsie, mentre il pannello
 * è aperto. Sotto il secondo si leggerebbero numeri che nessuno fa in tempo a
 * guardare. */
const PROBE_EVERY_MS = 1_000;

/** Oltre questo silenzio, con richieste in volo, qualcosa non sta rispondendo. */
const STALE_AFTER_MS = 20_000;

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

function humanSpeed(bytesPerSecond: number): string {
  return `${humanBytes(bytesPerSecond)}/s`;
}

/** Una riga del pannello: etichetta a sinistra, valore tecnico a destra. */
function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-editorial-muted">{label}</span>
      <span className={`tabular-nums ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-editorial-muted/70">{title}</div>
      {children}
    </div>
  );
}

/** Il corpo del pannello. Separato perché si disegna solo mentre è aperto: è
 * lui a interrogare il motore, e farlo a pannello chiuso sarebbe lavoro buttato. */
function NetworkPanel() {
  const { t } = useTranslation();
  const active = useNetworkActivity((state) => state.active);
  const queued = useNetworkActivity((state) => state.queued);
  const delivered = useNetworkActivity((state) => state.delivered);
  const deliveredBytes = useNetworkActivity((state) => state.deliveredBytes);
  const lastErrorAt = useNetworkActivity((state) => state.lastErrorAt);
  const lastOkAt = useNetworkActivity((state) => state.lastOkAt);
  const lastErrorMessage = useNetworkActivity((state) => state.lastErrorMessage);
  const speed = useNetworkActivity((state) => state.speed);
  const [probe, setProbe] = useState<NetworkProbe | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ask = async () => {
      try {
        const next = await networkProbe();
        if (!cancelled) setProbe(next);
      } catch {
        // Il motore non risponde alla sonda: il pannello mostra quello che sa
        // la finestra, che è comunque la metà che riguarda chi guarda.
        if (!cancelled) setProbe(null);
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), PROBE_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const failing = lastErrorAt !== null && (lastOkAt === null || lastErrorAt > lastOkAt);
  const served = probe?.served;
  const fromDisk = served ? served.fromVault + served.fromCache : 0;
  const total = served ? fromDisk + served.fromNetwork : 0;

  return (
    <div className="w-[19rem] space-y-2.5">
      <Section title={t('statusBar.network.requests')}>
        <Row
          label={t('statusBar.network.page')}
          value={`${active.page} + ${queued.page}`}
          tone={active.page > 0 ? 'text-editorial-success' : undefined}
        />
        <Row
          label={t('statusBar.network.thumbnails')}
          value={`${active.thumbnails} + ${queued.thumbnails}`}
        />
        <Row label={t('statusBar.network.speed')} value={humanSpeed(speed())} />
        <Row
          label={t('statusBar.network.delivered')}
          value={`${delivered} · ${humanBytes(deliveredBytes)}`}
        />
      </Section>

      {probe && probe.hosts.length > 0 && (
        <Section title={t('statusBar.network.lanes')}>
          {probe.hosts.map((host) => (
            <div key={host.host} className="space-y-0.5">
              <div className="truncate text-editorial-ink">{host.host}</div>
              <Row
                label={t('statusBar.network.seats')}
                value={`${host.inUse}/${host.seats}${host.bulkInUse > 0 ? ` · ${host.bulkInUse} ${t('statusBar.network.bulkShort')}` : ''}`}
                tone={host.inUse >= host.seats ? 'text-editorial-warning' : undefined}
              />
              <Row
                label={t('statusBar.network.perWindow', { seconds: host.windowSecs })}
                value={`${host.windowUsed}/${host.windowLimit}`}
                tone={host.windowUsed >= host.windowLimit ? 'text-editorial-warning' : undefined}
              />
              {host.cooldownSecs > 0 && (
                <Row
                  label={t('statusBar.network.cooldown')}
                  value={`${host.cooldownSecs} s`}
                  tone="text-editorial-danger"
                />
              )}
            </div>
          ))}
        </Section>
      )}

      {served && total > 0 && (
        <Section title={t('statusBar.network.images')}>
          <Row label={t('statusBar.network.fromVault')} value={String(served.fromVault)} />
          <Row label={t('statusBar.network.fromCache')} value={String(served.fromCache)} />
          <Row
            label={t('statusBar.network.fromNetwork')}
            value={`${served.fromNetwork} · ${humanBytes(served.networkBytes)}`}
          />
          <Row
            label={t('statusBar.network.spared')}
            value={`${Math.round((fromDisk / total) * 100)} %`}
            tone="text-editorial-success"
          />
        </Section>
      )}

      {failing && lastErrorMessage && (
        <Section title={t('statusBar.network.lastError')}>
          <div className="break-words text-editorial-danger">{lastErrorMessage}</div>
        </Section>
      )}
    </div>
  );
}

/**
 * Lo stato vero della rete verso le biblioteche.
 *
 * Un lavoro lento e un lavoro piantato si vedono uguali: qui si distinguono.
 * Il numero acceso è quanto c'è in volo; il pannello che si apre passandoci
 * sopra dice con chi si sta parlando, quanti posti restano in corsia verso
 * quella biblioteca, quante richieste sono già state spese nel minuto corrente
 * e quante immagini sono arrivate senza toccare la rete.
 */
export function NetworkActivity() {
  const { t } = useTranslation();
  const active = useNetworkActivity((state) => state.active);
  const queued = useNetworkActivity((state) => state.queued);
  const lastOkAt = useNetworkActivity((state) => state.lastOkAt);
  const lastErrorAt = useNetworkActivity((state) => state.lastErrorAt);
  const speed = useNetworkActivity((state) => state.speed);
  const [now, setNow] = useState(() => Date.now());

  const inFlight = active.page + active.thumbnails + queued.page + queued.thumbnails;
  const busy = inFlight > 0;

  useEffect(() => {
    // L'orologio gira solo mentre c'è traffico: fuori dalla Biblioteca la barra
    // non deve svegliarsi ogni secondo per non dire niente.
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [busy]);

  if (!busy && lastOkAt === null && lastErrorAt === null) return null;

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

  return (
    <Tooltip label={<NetworkPanel />} variant="panel" side="top">
      <span className={`flex items-center gap-1 ${tone}`} aria-label={t('statusBar.network.label')}>
        <Activity size={11} className={busy && !stale ? 'animate-pulse' : undefined} />
        <span className="tabular-nums">
          {busy ? inFlight : bytesPerSecond > 0 ? humanSpeed(bytesPerSecond) : '—'}
        </span>
      </span>
    </Tooltip>
  );
}
