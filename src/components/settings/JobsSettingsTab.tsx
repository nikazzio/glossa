import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RotateCw } from 'lucide-react';
import { Select, ToggleRow } from '../ui';
import {
  getAutoResumeDownloads,
  getJobLimits,
  limitCap,
  RESOURCE_CLASSES,
  setAutoResumeDownloads,
  setJobLimit,
  type JobLimits,
  type ResourceClass,
} from '../../services/jobSettingsService';

/**
 * Impostazioni dei lavori in background.
 *
 * I limiti sono **per classe di risorsa** (D11): il numero giusto lo sa chi ha
 * la macchina davanti, tranne per la rete, dove il collo di bottiglia è il
 * server della biblioteca e non il computer — lì il tetto non è superabile, per
 * non farsi bandire.
 */
export function JobsSettingsTab() {
  const { t } = useTranslation();
  const [limits, setLimits] = useState<JobLimits | null>(null);
  const [autoResume, setAutoResume] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLimits(await getJobLimits());
        setAutoResume(await getAutoResumeDownloads());
      } catch (error: unknown) {
        toast.error(t('settings.jobs.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [t]);

  const changeLimit = async (resource: ResourceClass, value: string) => {
    try {
      const saved = await setJobLimit(resource, Number.parseInt(value, 10));
      setLimits((current) => (current ? { ...current, [resource]: saved } : current));
    } catch (error: unknown) {
      toast.error(t('settings.jobs.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const changeAutoResume = async (enabled: boolean) => {
    setAutoResume(enabled);
    try {
      await setAutoResumeDownloads(enabled);
    } catch (error: unknown) {
      setAutoResume(!enabled);
      toast.error(t('settings.jobs.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div
      id="settings-panel-jobs"
      role="tabpanel"
      aria-labelledby="settings-tab-jobs"
      className="flex flex-col gap-6"
    >
      <section className="flex flex-col gap-3">
        {limits &&
          RESOURCE_CLASSES.map((resource) => (
            <div key={resource} className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-editorial-ink">
                {t(`settings.jobs.resource.${resource}`)}
              </span>
              <Select
                value={String(limits[resource])}
                onChange={(value) => changeLimit(resource, value)}
                ariaLabel={t(`settings.jobs.resource.${resource}`)}
                options={[
                  { value: '0', label: t('settings.jobs.automatic') },
                  ...Array.from({ length: limitCap(resource) }, (_, index) => ({
                    value: String(index + 1),
                    label: String(index + 1),
                  })),
                ]}
              />
            </div>
          ))}
      </section>

      <section className="border-t border-editorial-border/60 pt-4">
        <ToggleRow
          icon={<RotateCw size={13} />}
          label={t('settings.jobs.autoResume')}
          checked={autoResume}
          onChange={() => void changeAutoResume(!autoResume)}
        />
      </section>
    </div>
  );
}
