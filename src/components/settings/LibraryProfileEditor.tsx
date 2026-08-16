import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, RotateCcw } from 'lucide-react';
import { IconButton, Select, ToggleRow, Tooltip } from '../ui';
import { SettingRow } from './DownloadSettingsTab';
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
 * I valori di una biblioteca (D18).
 *
 * Arrivano tarati sul campo, e finché l'interruttore è spento si **vedono ma
 * non si toccano**: sono lì per essere letti, non per essere cambiati per
 * sbaglio. Accendendolo si sbloccano; spegnendolo la biblioteca torna a quelli
 * compilati nell'applicazione.
 *
 * Si salva quando si chiede, non a ogni tasto: un campo a metà — «2» mentre si
 * sta scrivendo «250» — non deve diventare la politica verso una biblioteca.
 */
export function LibraryProfileEditor({ library, onSave, onReset }: LibraryProfileEditorProps) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(library.customised);
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

  /** Spegnere l'interruttore è il ripristino: sotto restano i valori di fabbrica. */
  const changeCustom = async (enabled: boolean) => {
    setCustom(enabled);
    if (enabled || !library.customised) return;
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-base italic text-editorial-ink">{library.label}</span>
        <div className="flex items-center gap-2">
          {library.customised && (
            <Tooltip label={t('settings.libraries.reset')}>
              <span>
                <IconButton
                  size="sm"
                  onClick={() => void changeCustom(false)}
                  disabled={busy}
                  title={t('settings.libraries.reset')}
                >
                  <RotateCcw size={13} />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <IconButton
            size="sm"
            onClick={() => void save()}
            disabled={busy || !custom}
            title={t('settings.libraries.save')}
          >
            <Check size={13} />
          </IconButton>
        </div>
      </div>

      <ToggleRow
        icon={<RotateCcw size={13} />}
        label={t('settings.libraries.useOwn')}
        checked={custom}
        disabled={busy}
        onChange={() => void changeCustom(!custom)}
      />

      <fieldset
        disabled={!custom}
        className={`space-y-3 border-t border-editorial-border/70 pt-4 ${custom ? '' : 'opacity-50'}`}
      >
        <SettingRow label={t('settings.libraries.sizeCap')} hint={t('settings.libraries.sizeCapHint')}>
          <Select
            value={sizeCap}
            onChange={setSizeCap}
            disabled={!custom}
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
        </SettingRow>

        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-editorial-muted">
                {t(`settings.libraries.field.${field.key}`)}
              </span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={profile[field.key]}
                onChange={(event) => changeField(field.key, event.target.value)}
                className="w-24 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1 text-right text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed"
              />
            </label>
          ))}
        </div>

        <ToggleRow
          icon={<Check size={13} />}
          label={t('settings.libraries.field.needsViewerWarmup')}
          checked={profile.needsViewerWarmup}
          disabled={!custom}
          onChange={() =>
            setProfile((current) => ({ ...current, needsViewerWarmup: !current.needsViewerWarmup }))
          }
        />
      </fieldset>
    </div>
  );
}
