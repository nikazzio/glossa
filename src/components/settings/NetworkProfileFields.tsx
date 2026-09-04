import { useTranslation } from 'react-i18next';
import { FieldLabel, FIELD_CLASSNAME, FIELD_MONO_CLASSNAME } from '../ui';
import { MAX_HOST_CONCURRENCY, type NetworkValues } from '../../services/downloadSettingsService';

/**
 * Quante pagine di un libro partono davvero insieme.
 *
 * Il motore prende il minore fra le pagine chieste e i posti verso quella
 * biblioteca meno uno, che resta sempre libero per chi sta leggendo. Scrivere
 * «4 pagine» dove i posti sono 2 faceva partire una pagina sola, e nessuno lo
 * diceva: qui il massimo del campo è quello che accadrà.
 */
function pagesAtOnceCeiling(values: NetworkValues): number {
  return Math.min(Math.max(values.hostConcurrency, 2) - 1, MAX_HOST_CONCURRENCY - 1);
}

function pagesAtOnce(values: NetworkValues): number {
  return Math.min(values.workersPerJob, pagesAtOnceCeiling(values));
}

/**
 * Dopo un rifiuto si aspetta un solo tempo.
 *
 * Sotto restano due attese distinte — «vietato» e «rallenta» — e i valori
 * misurati sul campo non sono uguali. Il campo mostra la più lunga: è quella
 * che decide quanto si sta fermi nel caso peggiore, e proporre la più corta
 * inviterebbe a scendere sotto un tempo che una biblioteca ha già chiesto.
 */
function waitAfterRefusal(values: NetworkValues): number {
  return Math.max(values.cooldown403Secs, values.cooldown429Secs);
}

interface Knob {
  /** Nome del campo per etichetta e identificativo. */
  key: string;
  min: number;
  max: number;
  read: (values: NetworkValues) => number;
  write: (values: NetworkValues, next: number) => NetworkValues;
}

/** I tre che si usano. */
const KNOBS: Knob[] = [
  {
    key: 'pagesAtOnce',
    min: 1,
    max: MAX_HOST_CONCURRENCY - 1,
    read: pagesAtOnce,
    write: (values, next) => ({ ...values, workersPerJob: next }),
  },
  {
    key: 'requestsPerMinute',
    min: 1,
    max: 1_000,
    read: (values) => values.burstRequests,
    write: (values, next) => ({ ...values, burstRequests: next }),
  },
  {
    key: 'waitAfterRefusal',
    min: 0,
    max: 86_400,
    read: waitAfterRefusal,
    // Un tempo solo in vista vuol dire un tempo solo sotto: toccandolo, le due
    // attese diventano quella scritta. Chi non lo tocca conserva le sue.
    write: (values, next) => ({ ...values, cooldown403Secs: next, cooldown429Secs: next }),
  },
];

/** I due che servono quando qualcosa non va. */
const ADVANCED_KNOBS: Knob[] = [
  {
    key: 'maxAttempts',
    min: 1,
    max: 10,
    read: (values) => values.maxAttempts,
    write: (values, next) => ({ ...values, maxAttempts: next }),
  },
  {
    key: 'slowLibraryWaitSecs',
    min: 1,
    max: 300,
    read: (values) => values.readTimeoutSecs,
    write: (values, next) => ({ ...values, readTimeoutSecs: next }),
  },
];

/**
 * Il nome e i valori di un ritmo. Li tiene chi sta sopra, insieme al comando
 * che salva: scrivere in un campo non deve cambiare da solo la politica verso
 * una biblioteca — un «2» a metà di «250» diventerebbe la regola.
 *
 * Gli altri valori del profilo — la finestra del conteggio, i posti verso la
 * biblioteca, le attese fra un tentativo e l'altro, l'attesa per connettersi —
 * restano quelli che sono: sono numeri misurati sul campo, e una manopola per
 * ognuno faceva una schermata che nessuno poteva usare.
 */
export function NetworkProfileFields({
  name,
  values,
  onChange,
}: {
  name: string;
  values: NetworkValues;
  onChange: (name: string, values: NetworkValues) => void;
}) {
  const { t } = useTranslation();

  const change = (knob: Knob, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    onChange(name, knob.write(values, Number.isFinite(parsed) ? parsed : 0));
  };

  const knobField = (knob: Knob) => {
    // Le pagine insieme sono l'unico campo il cui massimo dipende dal profilo:
    // su una biblioteca che concede due posti, il massimo vero è uno.
    const max = knob.key === 'pagesAtOnce' ? pagesAtOnceCeiling(values) : knob.max;
    return (
      <div key={knob.key} className="space-y-1.5">
        <FieldLabel htmlFor={`settings-network-${knob.key}`} block>
          {t(`settings.network.field.${knob.key}`)}
        </FieldLabel>
        <input
          id={`settings-network-${knob.key}`}
          type="number"
          min={knob.min}
          max={max}
          step={1}
          value={knob.read(values)}
          onChange={(event) => change(knob, event.target.value)}
          className={FIELD_MONO_CLASSNAME}
        />
        <p className="text-xs text-editorial-muted">
          {t(`settings.network.fieldHint.${knob.key}`, { max })}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="settings-network-profile-name" block>
          {t('settings.network.name')}
        </FieldLabel>
        <input
          id="settings-network-profile-name"
          value={name}
          onChange={(event) => onChange(event.target.value, values)}
          className={FIELD_CLASSNAME}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{KNOBS.map(knobField)}</div>

      <details className="border-t border-editorial-border/70 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-editorial-muted">
          {t('settings.network.advanced')}
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {ADVANCED_KNOBS.map(knobField)}
        </div>
      </details>
    </div>
  );
}
