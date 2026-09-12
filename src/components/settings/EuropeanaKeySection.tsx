import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, SectionLabel, SettingRow } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import { settingsService, type ApiKeyStorage } from '../../services/llmService';
import { errorMessage, logger } from '../../utils/logger';

/** Il nome con cui la chiave sta nel portachiavi, lo stesso che usa il motore. */
const EUROPEANA = 'europeana';

/**
 * La chiave di Europeana.
 *
 * Europeana è l'unica fonte che ne chiede una: cerca in centinaia di
 * istituzioni e vuole sapere chi la interroga. Passa dallo stesso deposito
 * delle chiavi dei modelli — portachiavi del sistema, con ripiego cifrato —
 * quindi non finisce nel database né in un backup.
 */
export function EuropeanaKeySection() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  /** Dove la chiave è finita davvero: il portachiavi non c'è su ogni sistema,
   *  e il ripiego cifrato su file protegge meno. Dirlo cambia cosa l'utente
   *  può aspettarsi, quindi non si tace. */
  const [storage, setStorage] = useState<ApiKeyStorage | null>(null);

  useEffect(() => {
    let cancelled = false;
    settingsService
      .isKeyConfigured(EUROPEANA)
      .then((configured) => {
        if (!cancelled) setSaved(configured);
      })
      .catch((error: unknown) => {
        logger.warn('europeana key status failed', { message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    try {
      const where = await settingsService.saveApiKey(EUROPEANA, key);
      setSaved(true);
      setStorage(where);
      setValue('');
      if (where === 'file') {
        toast.warning(t('settings.library.europeanaSavedFallback'));
      } else {
        toast.success(t('settings.library.europeanaSaved'));
      }
    } catch (error: unknown) {
      toast.error(t('settings.library.europeanaSaveFailed'), {
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    setBusy(true);
    try {
      await settingsService.deleteApiKey(EUROPEANA);
      setSaved(false);
      setStorage(null);
      toast.success(t('settings.library.europeanaForgotten'));
    } catch (error: unknown) {
      toast.error(t('settings.library.europeanaForgetFailed'), {
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <SectionLabel icon={KeyRound} label={t('settings.library.europeanaTitle')} />
      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow
          label={t('settings.library.europeanaKey')}
          hint={
            !saved
              ? t('settings.library.europeanaKeyHint')
              : storage === 'file'
                ? t('settings.library.europeanaKeySavedFileHint')
                : t('settings.library.europeanaKeySavedHint')
          }
        >
          <div className="flex shrink-0 items-center gap-2">
            {/* Una chiave salvata non si rilegge: il portachiavi la restituisce
                al motore, non alla schermata. Si può solo sostituire o togliere. */}
            {saved && (
              <span
                className="flex items-center gap-1 text-xs text-editorial-success"
                role="status"
              >
                <Check size={13} aria-hidden="true" />
                {t('settings.library.europeanaSavedBadge')}
              </span>
            )}
            <input
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('settings.library.europeanaPlaceholder')}
              aria-label={t('settings.library.europeanaKey')}
              className={`${FIELD_CLASSNAME} w-56 py-1 text-xs`}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
              }}
            />
            <IconButton
              size="sm"
              tone="accent"
              disabled={busy || value.trim() === ''}
              onClick={() => void save()}
              title={t('settings.library.europeanaSave')}
            >
              <Check size={13} />
            </IconButton>
            {saved && (
              <IconButton
                size="sm"
                tone="danger"
                disabled={busy}
                onClick={() => void forget()}
                title={t('settings.library.europeanaForget')}
              >
                <Trash2 size={13} />
              </IconButton>
            )}
          </div>
        </SettingRow>
      </div>
    </section>
  );
}
