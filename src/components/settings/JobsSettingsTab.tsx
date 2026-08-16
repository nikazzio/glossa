import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Layers, RotateCw } from 'lucide-react';
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
      className="space-y-10"
    >
      <section className="space-y-4">
        <div className="flex items-center gap-1.5">
          <Layers size={11} className="shrink-0 text-editorial-accent" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.jobs.limits')}
          </p>
        </div>
        <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
          {limits &&
            RESOURCE_CLASSES.map((resource) => (
              <div key={resource} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-editorial-ink">
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
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-1.5">
          <RotateCw size={11} className="shrink-0 text-editorial-accent" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.jobs.reopening')}
          </p>
        </div>
        <div className="border-y border-editorial-border/70 py-3">
          <ToggleRow
            icon={<RotateCw size={13} />}
            label={t('settings.jobs.autoResume')}
            checked={autoResume}
            onChange={() => void changeAutoResume(!autoResume)}
          />
        </div>
      </section>
    </div>
  );
}
