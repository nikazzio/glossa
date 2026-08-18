import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Images, Trash2 } from 'lucide-react';
import { IconButton, SectionLabel, Select, SettingRow } from '../ui';
import {
  CACHE_CAPS,
  DEFAULT_CACHE_MAX_BYTES,
  DEFAULT_SEARCH_TTL_HOURS,
  SEARCH_TTLS,
  applyCacheCap,
  cacheUsage,
  clearCache,
  getCacheMaxBytes,
  getSearchTtlHours,
  setCacheMaxBytes,
  setSearchTtlHours,
} from '../../services/cacheService';
import { humanSize } from '../../utils';

/**
 * Quello che si guarda senza scaricarlo: copertine, miniature e risposte delle
 * ricerche.
 *
 * Non è il deposito: si può svuotare in qualsiasi momento senza perdere niente,
 * non entra in un backup e non conta come «scaricato». Il modo di **fissare**
 * un libro resta scaricarlo (D8).
 */
export function CacheSection() {
  const { t } = useTranslation();
  const [maxBytes, setMax] = useState(DEFAULT_CACHE_MAX_BYTES);
  const [ttlHours, setTtl] = useState(DEFAULT_SEARCH_TTL_HOURS);
  const [used, setUsed] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUsed((await cacheUsage()).bytes);
    } catch {
      // Una cache non ancora creata non ha occupazione: non è un errore.
      setUsed(0);
    }
  }, []);

  // L'occupazione cambia mentre guardi altrove: se la finestra torna in primo
  // piano, la cifra va riletta, altrimenti resta quella di quando hai aperto le
  // impostazioni e il comando per svuotare sembra spento senza ragione.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    const load = async () => {
      try {
        setMax(await getCacheMaxBytes());
        setTtl(await getSearchTtlHours());
      } catch (error: unknown) {
        toast.error(t('settings.cache.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
      await refresh();
    };
    void load();
  }, [refresh, t]);

  const changeMax = async (value: string) => {
    const previous = maxBytes;
    const next = Number(value);
    setMax(next);
    try {
      await setCacheMaxBytes(next);
      // Il tetto nuovo vale adesso, non alla prossima copertina.
      setUsed((await applyCacheCap()).bytes);
    } catch (error: unknown) {
      setMax(previous);
      toast.error(t('settings.cache.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const changeTtl = async (value: string) => {
    const previous = ttlHours;
    const next = Number(value);
    setTtl(next);
    try {
      await setSearchTtlHours(next);
    } catch (error: unknown) {
      setTtl(previous);
      toast.error(t('settings.cache.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const empty = async () => {
    try {
      await clearCache();
      await refresh();
      toast.success(t('settings.cache.cleared'));
    } catch (error: unknown) {
      toast.error(t('settings.cache.clearFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section className="space-y-4">
      <SectionLabel icon={Images} label={t('settings.cache.title')} />
      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow label={t('settings.cache.used')} hint={t('settings.cache.usedHint')}>
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm text-editorial-ink">
              {used === null ? '—' : humanSize(used)}
            </span>
            <IconButton
              title={t('settings.cache.clear')}
              onClick={() => void empty()}
              disabled={!used}
              size="sm"
            >
              <Trash2 size={14} />
            </IconButton>
          </span>
        </SettingRow>

        <SettingRow label={t('settings.cache.cap')} hint={t('settings.cache.capHint')}>
          <Select
            value={String(maxBytes)}
            onChange={(value) => void changeMax(value)}
            ariaLabel={t('settings.cache.cap')}
            options={CACHE_CAPS.map((value) => ({ value: String(value), label: humanSize(value) }))}
          />
        </SettingRow>

        <SettingRow label={t('settings.cache.searchTtl')} hint={t('settings.cache.searchTtlHint')}>
          <Select
            value={String(ttlHours)}
            onChange={(value) => void changeTtl(value)}
            ariaLabel={t('settings.cache.searchTtl')}
            options={SEARCH_TTLS.map((value) => ({
              value: String(value),
              label: t('settings.cache.hours', { count: value }),
            }))}
          />
        </SettingRow>
      </div>
    </section>
  );
}
