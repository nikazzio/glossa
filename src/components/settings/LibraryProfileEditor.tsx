import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe, RotateCcw } from 'lucide-react';
import { IconButton, Select, ToggleRow } from '../ui';
import {
  MAX_HOST_CONCURRENCY,
  MAX_SIZE_CAP,
  SIZE_CAPS,
  type LibrarySettings,
  type NetworkProfile,
} from '../../services/downloadSettingsService';

/**
 * I campi numerici del profilo, con gli estremi che il backend applica
 * comunque (D11, D18). Un elenco invece di tredici blocchi uguali: aggiungere
 * un campo al profilo vuol dire aggiungere una riga qui.
 */
const FIELDS: Array<{ key: NumericField; min: number; max: number }> = [
  { key: 'pauseMinMs', min: 0, max: 60_000 },
  { key: 'pauseMaxMs', min: 0, max: 60_000 },
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

type NumericField = Exclude<keyof NetworkProfile, 'needsViewerWarmup'>;

interface LibraryProfileEditorProps {
  library: LibrarySettings;
  onSave: (sizeCap: string | null, profile: NetworkProfile) => Promise<void>;
  onReset: () => Promise<void>;
}

/**
 * I valori di una biblioteca: il tetto di risoluzione e il modo di stare al
 * suo tavolo (D18).
 *
 * Si salva quando si chiede, non a ogni tasto: un campo a metà — «2» mentre si
 * sta scrivendo «250» — non deve diventare la politica verso quella
 * biblioteca.
 */
export function LibraryProfileEditor({ library, onSave, onReset }: LibraryProfileEditorProps) {
  const { t } = useTranslation();
  const [sizeCap, setSizeCap] = useState<string>(library.sizeCap ?? '');
  const [profile, setProfile] = useState<NetworkProfile>(library.profile);
  const [busy, setBusy] = useState(false);

  const changeField = (key: NumericField, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    setProfile((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(sizeCap === '' ? null : sizeCap, profile);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-editorial-border/60 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-editorial-ink">
          {t('settings.libraries.sizeCap')}
        </span>
        <Select
          value={sizeCap}
          onChange={setSizeCap}
          ariaLabel={t('settings.libraries.sizeCap')}
          options={[
            { value: '', label: t('settings.libraries.sizeCapInherited') },
            ...SIZE_CAPS.map((value) => ({
              value,
              label:
                value === MAX_SIZE_CAP
                  ? t('settings.download.sizeCapMax')
                  : t('settings.download.pixels', { value }),
            })),
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-editorial-muted">
              {t(`settings.libraries.field.${field.key}`)}
            </span>
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={profile[field.key]}
              onChange={(event) => changeField(field.key, event.target.value)}
              className="w-24 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1 text-right text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </label>
        ))}
      </div>

      <ToggleRow
        icon={<Globe size={13} />}
        label={t('settings.libraries.field.needsViewerWarmup')}
        checked={profile.needsViewerWarmup}
        onChange={() =>
          setProfile((current) => ({ ...current, needsViewerWarmup: !current.needsViewerWarmup }))
        }
      />

      <p className="text-[11px] leading-relaxed text-editorial-muted">
        {t('settings.libraries.concurrencyHint', { max: MAX_HOST_CONCURRENCY })}
      </p>

      <div className="flex items-center justify-end gap-1">
        <IconButton
          size="sm"
          onClick={() => void reset()}
          disabled={busy || !library.customised}
          title={t('settings.libraries.reset')}
        >
          <RotateCcw size={13} />
        </IconButton>
        <IconButton size="sm" onClick={() => void save()} disabled={busy} title={t('settings.libraries.save')}>
          <Check size={13} />
        </IconButton>
      </div>
    </div>
  );
}
