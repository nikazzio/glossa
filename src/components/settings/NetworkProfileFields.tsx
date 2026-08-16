import { useTranslation } from 'react-i18next';
import { MAX_HOST_CONCURRENCY, type NetworkValues } from '../../services/downloadSettingsService';

/**
 * I campi di un ritmo, con gli estremi che il backend applica comunque (D11).
 * Un elenco invece di dodici blocchi uguali: aggiungere un valore al profilo
 * vuol dire aggiungere una riga qui.
 */
const FIELDS: Array<{ key: NumericField; min: number; max: number; step?: number }> = [
  { key: 'pauseMinMs', min: 0, max: 60_000, step: 100 },
  { key: 'pauseMaxMs', min: 0, max: 60_000, step: 100 },
  { key: 'burstRequests', min: 1, max: 1_000 },
  { key: 'burstWindowSecs', min: 1, max: 3_600 },
  { key: 'hostConcurrency', min: 1, max: MAX_HOST_CONCURRENCY },
  { key: 'maxAttempts', min: 1, max: 10 },
  { key: 'backoffBaseSecs', min: 1, max: 600 },
  { key: 'backoffCapSecs', min: 1, max: 3_600 },
  { key: 'cooldown403Secs', min: 0, max: 86_400 },
  { key: 'cooldown429Secs', min: 0, max: 86_400 },
  { key: 'connectTimeoutSecs', min: 1, max: 300 },
  { key: 'readTimeoutSecs', min: 1, max: 300 },
];

type NumericField = Exclude<keyof NetworkValues, 'needsViewerWarmup'>;

/**
 * Il nome e i valori di un ritmo. Li tiene chi sta sopra, insieme al comando
 * che salva: scrivere in un campo non deve cambiare da solo la politica verso
 * una biblioteca — un «2» a metà di «250» diventerebbe la regola.
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

  const change = (key: NumericField, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    onChange(name, { ...values, [key]: Number.isFinite(parsed) ? parsed : 0 });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="settings-network-profile-name"
          className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted"
        >
          {t('settings.network.name')}
        </label>
        <input
          id="settings-network-profile-name"
          value={name}
          onChange={(event) => onChange(event.target.value, values)}
          className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 font-display text-sm italic outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label
              htmlFor={`settings-network-${field.key}`}
              className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted"
            >
              {t(`settings.network.field.${field.key}`)}
            </label>
            <input
              id={`settings-network-${field.key}`}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={values[field.key]}
              onChange={(event) => change(field.key, event.target.value)}
              className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
