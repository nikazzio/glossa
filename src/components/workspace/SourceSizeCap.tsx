import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Select } from '../ui';
import {
  getVersionSizeCap,
  MAX_SIZE_CAP,
  setVersionSizeCap,
  SIZE_CAPS,
} from '../../services/downloadSettingsService';

/**
 * La misura con cui si scarica **questa** opera (D4).
 *
 * È l'ultima parola: passa davanti a quella della biblioteca e a quella
 * generale, perché la scelta dipende dal materiale — una cinquecentina a
 * stampa larga si legge a molto meno di una minuscola fitta.
 *
 * Vale per gli scaricamenti che partono da adesso: le pagine già sul computer
 * restano dove sono, alla misura con cui sono arrivate.
 */
export function SourceSizeCap({ versionId }: { versionId: string }) {
  const { t } = useTranslation();
  const [cap, setCap] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      try {
        setCap((await getVersionSizeCap(versionId)) ?? '');
      } catch (error: unknown) {
        toast.error(t('areas.library.sizeCapLoadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [versionId, t]);

  const change = async (value: string) => {
    const previous = cap;
    setCap(value);
    try {
      await setVersionSizeCap(versionId, value === '' ? null : value);
    } catch (error: unknown) {
      setCap(previous);
      toast.error(t('areas.library.sizeCapSaveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-editorial-muted">{t('areas.library.sizeCap')}</span>
      <Select
        value={cap}
        onChange={(value) => void change(value)}
        ariaLabel={t('areas.library.sizeCap')}
        options={[
          { value: '', label: t('areas.library.sizeCapInherited') },
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
  );
}
