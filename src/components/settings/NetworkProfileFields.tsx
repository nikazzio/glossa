import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { IconButton } from '../ui';
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
 * Il nome e i valori di un ritmo.
 *
 * Si salva quando si chiede, non a ogni tasto: un campo a metà — «2» mentre si
 * sta scrivendo «250» — non deve diventare la politica verso una biblioteca.
 */
export function NetworkProfileFields({
  name,
  values,
  onSave,
}: {
  name: string;
  values: NetworkValues;
  onSave: (name: string, values: NetworkValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(name);
  const [draft, setDraft] = useState(values);
  const [busy, setBusy] = useState(false);

  const change = (key: NumericField, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    setDraft((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(draftName.trim(), draft);
    } finally {
      setBusy(false);
    }
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
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
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
              value={draft[field.key]}
              onChange={(event) => change(field.key, event.target.value)}
              className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <IconButton size="sm" onClick={() => void save()} disabled={busy || draftName.trim() === ''} title={t('settings.network.save')}>
          <Check size={13} />
        </IconButton>
      </div>
    </div>
  );
}
