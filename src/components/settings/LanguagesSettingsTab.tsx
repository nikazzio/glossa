import { useCallback, useEffect, useState } from 'react';
import { Languages, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { loadLanguageCatalog, type LanguageListInfo } from '../../languages/catalog';
import { updateLanguageLists } from '../../services/languageListService';
import { errorMessage, logger } from '../../utils/logger';
import { IconButton, PanelSection, SECTION_SETTING_LIST_CLASSNAME, SettingRow, Spinner } from '../ui';

/** L'elenco delle lingue in uso e il comando che lo riscarica dalle fonti ufficiali. */
export function LanguagesSettingsTab() {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<LanguageListInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo((await loadLanguageCatalog()).info);
      setLoadFailed(false);
    } catch (error: unknown) {
      logger.error('settings.languages.load_failed', { message: errorMessage(error) });
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async () => {
    setUpdating(true);
    try {
      const result = await updateLanguageLists();
      toast.success(t('settings.languages.updated', { added: result.added, retired: result.retired }));
      await load();
    } catch (error: unknown) {
      logger.warn('settings.languages.update_failed', { message: errorMessage(error) });
      toast.error(t('settings.languages.updateFailed'));
    } finally {
      setUpdating(false);
    }
  };

  const number = (value: number) => value.toLocaleString(i18n.language);
  const date = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const value = (text: string) => <span className="font-display text-sm tabular-nums text-editorial-ink">{text}</span>;

  return (
    <div id="settings-panel-languages" role="tabpanel" aria-labelledby="settings-tab-languages" className="space-y-10">
      <PanelSection icon={Languages} label={t('settings.languages.title')} hint={t('settings.languages.hint')}
        actions={
          <IconButton size="sm" onClick={() => void update()} disabled={updating} title={t('settings.languages.update')}>
            <RefreshCw size={13} className={updating ? 'animate-spin' : ''} />
          </IconButton>
        }>
        {loadFailed && <p role="alert" className="text-sm text-editorial-danger">{t('settings.languages.loadFailed')}</p>}
        {!info && !loadFailed && <Spinner label={t('common.loading')} />}
        {info && (
          <div className={SECTION_SETTING_LIST_CLASSNAME}>
            <SettingRow label={t('settings.languages.origin')} hint={t('settings.languages.originHint')}>
              {value(t(`settings.languages.origin_${info.origin}`))}
            </SettingRow>
            <SettingRow label={t('settings.languages.iso')} hint={t('settings.languages.isoHint')}>
              {value(`${number(info.languageCount)} · ${date(info.languagesRetrievedAt)}`)}
            </SettingRow>
            <SettingRow label={t('settings.languages.varieties')} hint={t('settings.languages.varietiesHint')}>
              {value(`${number(info.varietyCount)} · ${date(info.varietiesRetrievedAt)}`)}
            </SettingRow>
            <SettingRow label={t('settings.languages.retired')} hint={t('settings.languages.retiredHint')}>
              {value(number(info.retiredCount))}
            </SettingRow>
          </div>
        )}
      </PanelSection>
    </div>
  );
}
