import { useTranslation } from 'react-i18next';
import type { Job } from '../../services/jobsService';
import { Tooltip } from '../ui';

/** Counts, not a percentage of heterogeneous work completed. */
export function JobsOverviewChart({ jobs }: { jobs: Job[] }) {
  const { t } = useTranslation();
  const series = [
    { label: t('jobs.running'), count: jobs.filter((j) => ['running','pausing','cancelling'].includes(j.status)).length, color: 'bg-editorial-running' },
    { label: t('jobs.queued'), count: jobs.filter((j) => j.status === 'queued').length, color: 'bg-editorial-charcoal' },
    { label: t('jobs.paused'), count: jobs.filter((j) => j.status === 'paused').length, color: 'bg-editorial-muted' },
    { label: t('jobs.failed'), count: jobs.filter((j) => j.status === 'error').length, color: 'bg-editorial-danger' },
  ];
  const maximum = Math.max(1, ...series.map((s) => s.count));
  return <dl className="space-y-2" aria-label={t('overview.openJobs')}>
    {series.map((item) => <div key={item.label} className="grid grid-cols-[minmax(0,6rem)_minmax(2rem,1fr)_2rem] items-center gap-2 text-xs">
      <dt className="truncate text-editorial-muted">{item.label}</dt>
      <Tooltip label={`${item.label}: ${item.count}`} className="w-full">
        <span className="block h-1.5 w-full overflow-hidden rounded bg-editorial-textbox" aria-hidden="true"><span className={`block h-full rounded ${item.color}`} style={{ width: `${item.count / maximum * 100}%` }} /></span>
      </Tooltip>
      <dd className="text-right tabular-nums text-editorial-ink">{item.count}</dd>
    </div>)}
  </dl>;
}
