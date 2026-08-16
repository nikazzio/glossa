import { ChevronRight, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TerminalIconButton } from './TerminalIconButton';
import {
  formatEta,
  isTerminal,
  isWaitingForLibrary,
  isWaitingToRetry,
  retryCountdownSeconds,
  type Job,
} from '../../services/jobsService';
import { isFinishedRecently, isRunning, useJobsStore } from '../../stores/jobsStore';
import { parseJobDetail, type JobDetail } from '../../services/jobsService';
import { humanSize } from '../../utils';

/**
 * La scheda Lavori del pannello in basso (D20).
 *
 * Tre sezioni — in corso, in attesa, terminati oggi — e per ciascun lavoro solo
 * i comandi ammessi dal suo stato, come icone neutre con spiegazione al
 * passaggio del mouse.
 *
 * Sta dentro il pannello scuro insieme ai messaggi, quindi usa **solo** i token
 * `terminal-*`: infiltrare l'accento dell'interfaccia chiara romperebbe il
 * principio del terminale come versione scura degli stessi toni.
 */
export function JobsPanel({ panelId, labelledBy }: { panelId: string; labelledBy: string }) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const now = Date.now();

  const running = jobs.filter(isRunning);
  const waiting = jobs.filter((job) => !isTerminal(job) && !isRunning(job));
  const finished = jobs.filter((job) => isFinishedRecently(job, now));

  const isEmpty = running.length === 0 && waiting.length === 0 && finished.length === 0;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="terminal-scrollbar h-full overflow-y-auto bg-terminal-bg px-3 py-2"
    >
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
          <p className="text-sm text-terminal-secondary">{t('jobs.emptyTitle')}</p>
          <p className="text-xs text-terminal-muted">{t('jobs.emptyDescription')}</p>
        </div>
      ) : (
        <>
          <JobsSection title={t('jobs.sectionRunning')} jobs={running} />
          <JobsSection title={t('jobs.sectionWaiting')} jobs={waiting} />
          <JobsSection title={t('jobs.sectionFinished')} jobs={finished} />
        </>
      )}
    </div>
  );
}

function JobsSection({ title, jobs }: { title: string; jobs: Job[] }) {
  if (jobs.length === 0) return null;

  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1 text-[11px] uppercase tracking-wide text-terminal-secondary">{title}</h3>
      <ul className="flex flex-col gap-1">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobRow job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Una riga del pannello.
 *
 * Chiusa dice le cose che servono a colpo d'occhio: **di che tipo di lavoro si
 * tratta**, su cosa, a che punto è e quanto pesa — quello che è arrivato e
 * quanto si prevede in tutto, perché il peso della sola unità in corso non dice
 * niente su quanto manca. Aperta mostra i dettagli veri: risoluzione chiesta,
 * host, tentativi, orari.
 */
function JobRow({ job }: { job: Job }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pause = useJobsStore((state) => state.pause);
  const resume = useJobsStore((state) => state.resume);
  const cancel = useJobsStore((state) => state.cancel);
  const retry = useJobsStore((state) => state.retry);
  const clearFinished = useJobsStore((state) => state.clearFinished);

  const waitingToRetry = isWaitingToRetry(job);
  const eta = formatEta(job.etaSeconds);
  const detail = parseJobDetail(job.detail);
  const description = job.message ?? t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType });

  return (
    <div className="rounded border border-terminal-line bg-terminal-chrome">
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Il riepilogo è il comando che apre: il resto della riga resta libero
            per i comandi veri, che non devono aprire niente per sbaglio. */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"
        >
          <ChevronRight
            size={11}
            className={`shrink-0 text-terminal-dim motion-safe:transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="shrink-0 rounded-sm border border-terminal-line px-1 py-px text-[10px] uppercase tracking-wide text-terminal-secondary">
            {t(`jobs.short.${job.jobType}`, { defaultValue: job.jobType })}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-terminal-ink">{description}</span>
          {detail.units && (
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-terminal-muted">
              {detail.units.done}/{detail.units.total}
            </span>
          )}
          {detail.bytes && (
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-terminal-muted">
              {humanSize(detail.bytes.downloaded)}
              {detail.bytes.estimated > 0 && ` / ~${humanSize(detail.bytes.estimated)}`}
            </span>
          )}
        </button>

        <span className="shrink-0 whitespace-nowrap text-xs text-terminal-muted">
          <JobStateLabel job={job} eta={eta} />
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {job.status === 'running' && (
            <TerminalIconButton label={t('jobs.pause')} onClick={() => void pause(job.id)}>
              <Pause size={11} />
            </TerminalIconButton>
          )}
          {job.status === 'paused' && (
            <TerminalIconButton label={t('jobs.resume')} onClick={() => void resume(job.id)}>
              <Play size={11} />
            </TerminalIconButton>
          )}
          {/* Un lavoro che riproverà da solo **non è in pausa**: finché mostrava
              lo stesso pulsante sembrava fermo per volontà di chi guarda. Qui
              il comando serve a non aspettare l'attesa, non a farlo ripartire. */}
          {waitingToRetry && (
            <TerminalIconButton label={t('jobs.retryNow')} onClick={() => void resume(job.id)}>
              <Play size={11} />
            </TerminalIconButton>
          )}
          {waitingToRetry && (
            <TerminalIconButton label={t('jobs.pause')} onClick={() => void pause(job.id)}>
              <Pause size={11} />
            </TerminalIconButton>
          )}
          {job.status === 'error' && (
            <TerminalIconButton label={t('jobs.retry')} onClick={() => void retry(job.id)}>
              <RotateCcw size={11} />
            </TerminalIconButton>
          )}
          {!isTerminal(job) && (
            <TerminalIconButton label={t('jobs.cancel')} tone="danger" onClick={() => void cancel(job.id)}>
              <X size={11} />
            </TerminalIconButton>
          )}
          {isTerminal(job) && (
            <TerminalIconButton label={t('jobs.dismiss')} onClick={() => void clearFinished(job.id)}>
              <Trash2 size={11} />
            </TerminalIconButton>
          )}
        </div>
      </div>

      <div className="px-2.5 pb-2">
        <JobProgress job={job} />
      </div>

      {/* La riga cresce invece di scattare: due righe di griglia da 0fr a 1fr,
          che è l'unico modo di animare un'altezza che non si conosce. */}
      <div
        className={`grid px-2.5 motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${
          open ? 'grid-rows-[1fr] pb-2' : 'grid-rows-[0fr]'
        }`}
      >
        {/* Montata solo da aperta: lasciarla nel documento raddoppierebbe ogni
            valore — l'errore, i byte — anche per chi legge con la tastiera o
            con un lettore di schermo. */}
        <div className="overflow-hidden">{open && <JobDetails job={job} detail={detail} />}</div>
      </div>
    </div>
  );
}

/** Una coppia etichetta/valore della scheda dei dettagli. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-terminal-secondary">{label}</span>
      <span className="min-w-0 truncate font-mono text-xs text-terminal-ink">{value}</span>
    </div>
  );
}

/**
 * I dettagli veri di un lavoro: quello che serve per capire cosa sta facendo e
 * perché ci mette tanto. Le chiavi le decide il gestore, qui si mostrano quelle
 * che ci sono — un lavoro futuro che ne manda di nuove non rompe niente, e
 * quelle che non conosciamo restano fuori invece di comparire a metà.
 */
function JobDetails({ job, detail }: { job: Job; detail: JobDetail }) {
  const { t } = useTranslation();
  // Sempre su 24 ore: un registro tecnico non si legge con AM e PM.
  const time = (value: string | null) =>
    value
      ? new Date(value.replace(' ', 'T') + 'Z').toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      : '—';

  // Due blocchi, perché sono due cose diverse: quello che vale per **tutto il
  // lavoro** e quello che vale per **l'ultima pagina** passata. Mescolarli
  // faceva leggere il peso di una pagina come se fosse quello del libro.
  const work = [
    [t('jobs.detail.type'), t(`jobs.type.${job.jobType}`, { defaultValue: job.jobType })],
    [t('jobs.detail.phase'), job.phase ? t(`jobs.phase.${job.phase}`, { defaultValue: job.phase }) : '—'],
    detail.units && [
      t(`jobs.detail.units.${detail.units.label}`, { defaultValue: t('jobs.detail.units.generic') }),
      `${detail.units.done} / ${detail.units.total}`,
    ],
    detail.bytes && [
      t('jobs.detail.bytes'),
      detail.bytes.estimated > 0
        ? `${humanSize(detail.bytes.downloaded)} / ~${humanSize(detail.bytes.estimated)}`
        : humanSize(detail.bytes.downloaded),
    ],
    detail.size && [t('jobs.detail.size'), detail.size],
    detail.available?.length && [t('jobs.detail.available'), detail.available.join(' · ')],
    detail.provider && [t('jobs.detail.provider'), detail.provider],
    detail.host && [t('jobs.detail.host'), detail.host],
    detail.level && [
      t('jobs.detail.level'),
      t(`jobs.detail.levelValue.${detail.level}`, { defaultValue: detail.level }),
    ],
    detail.intact !== undefined && [t('jobs.detail.intact'), String(detail.intact)],
    detail.missing !== undefined && [t('jobs.detail.missing'), String(detail.missing)],
    detail.corrupt !== undefined && [t('jobs.detail.corrupt'), String(detail.corrupt)],
    detail.orphans && [
      t('jobs.detail.orphans'),
      `${detail.orphans.count} · ${humanSize(detail.orphans.bytes)}`,
    ],
    [t('jobs.detail.attempt'), `${job.attemptCount} / ${job.maxAttempts}`],
    [t('jobs.detail.started'), time(job.createdAt)],
    [t('jobs.detail.updated'), time(job.updatedAt)],
    job.error && [t('jobs.detail.error'), job.error],
    [t('jobs.detail.id'), job.id],
  ].filter((entry): entry is [string, string] => Array.isArray(entry));

  const lastUnit = detail.last
    ? ([
        [t('jobs.detail.lastIndex'), String(detail.last.index)],
        [t('jobs.detail.lastBytes'), humanSize(detail.last.bytes)],
      ] as Array<[string, string]>)
    : [];

  return (
    <div className="flex flex-col gap-2 border-t border-terminal-line pt-2">
      <FieldGroup title={t('jobs.detail.groupWork')} fields={work} />
      {lastUnit.length > 0 && (
        <FieldGroup title={t('jobs.detail.groupLast')} fields={lastUnit} />
      )}
    </div>
  );
}

/** Un blocco di dettagli con il suo titolo: dice **di cosa** parlano i numeri. */
function FieldGroup({ title, fields }: { title: string; fields: Array<[string, string]> }) {
  return (
    <section>
      <h4 className="mb-1 text-[11px] uppercase tracking-wide text-terminal-secondary">{title}</h4>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <Field key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function JobStateLabel({ job, eta }: { job: Job; eta: string | null }) {
  const { t } = useTranslation();

  // Fermo in attesa di riprovare e fermo perché fallito sono la stessa
  // immobilità con significati opposti (D17): vanno dette diversamente.
  if (isWaitingToRetry(job)) {
    // Il tempo mostrato è quello che manca al tentativo, non la stima dello
    // scaricamento: erano due numeri diversi sotto la stessa etichetta.
    const countdown = formatEta(retryCountdownSeconds(job));
    return (
      <span className="text-terminal-warn">
        {countdown ? t('jobs.retryingIn', { eta: countdown }) : t('jobs.retrying')}
      </span>
    );
  }
  if (isWaitingForLibrary(job)) {
    return <span className="text-terminal-warn">{t('jobs.waitingForLibrary')}</span>;
  }
  if (job.status === 'error') {
    return <span className="text-terminal-error">{job.error ?? t('jobs.failed')}</span>;
  }
  if (job.status === 'completed') return <span className="text-terminal-success">{t('jobs.done')}</span>;
  if (job.status === 'cancelled') return <span>{t('jobs.cancelled')}</span>;
  if (job.status === 'pausing') return <span>{t('jobs.pausing')}</span>;
  if (job.status === 'cancelling') return <span>{t('jobs.cancelling')}</span>;
  if (job.status === 'paused') return <span>{t('jobs.paused')}</span>;
  if (job.status === 'queued') return <span>{t('jobs.queued')}</span>;

  // In esecuzione si legge **cosa sta facendo**, non un generico «in corso»:
  // lettura del manifesto, scelta della risoluzione, scaricamento. Le fasi che
  // l'interfaccia non conosce si mostrano com'è scritta la chiave, invece di
  // sparire.
  const phase = job.phase ? t(`jobs.phase.${job.phase}`, { defaultValue: job.phase }) : null;
  const parts = [phase, eta ? t('jobs.etaShort', { eta }) : null].filter(Boolean);
  return <span>{parts.length > 0 ? parts.join(' · ') : t('jobs.running')}</span>;
}

/**
 * La barra si muove con continuità fra un valore e il successivo (D17), ma
 * **mai** quando il lavoro è fermo: lì resta immobile, perché interpolare un
 * avanzamento che non esiste significa far aspettare fidandosi di un numero
 * falso. La transizione rispetta anche la preferenza di sistema per il
 * movimento ridotto.
 */
function JobProgress({ job }: { job: Job }) {
  if (isTerminal(job) || job.progress <= 0) return null;

  const stalled = isWaitingToRetry(job) || isWaitingForLibrary(job) || job.status === 'paused';

  return (
    <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-terminal-line">
      <div
        // Larghezza minima visibile: una carta su trecento è lo 0,3%, che
        // arrotondato sparisce e fa sembrare la barra ferma.
        role="progressbar"
        aria-valuenow={Math.round(job.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`h-full min-w-[2px] ${stalled ? 'bg-terminal-warn' : 'bg-terminal-accent motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear'}`}
        style={{ width: `${Math.min(100, Math.round(job.progress * 100))}%` }}
      />
    </div>
  );
}
