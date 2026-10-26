import { ArrowRightLeft, Network } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeeplConfig, DeeplLanguageInfo } from '../../types';
import { deeplService } from '../../services/deeplService';
import { IconButton, PanelSection, Select } from '../ui';

export function DeeplLanguagePair({ value, disabledReason, active, onChange }: {
  value: DeeplConfig;
  disabledReason?: string;
  active: boolean;
  onChange: (value: DeeplConfig) => void;
}) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<DeeplLanguageInfo[]>([]);
  const [targets, setTargets] = useState<DeeplLanguageInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let current = true;
    setError(null);
    void Promise.allSettled([deeplService.getLanguages('source'), deeplService.getLanguages('target')])
      .then(([source, target]) => {
        if (!current) return;
        if (source.status === 'fulfilled') setSources(source.value);
        if (target.status === 'fulfilled') setTargets(target.value);
        if (source.status === 'rejected' || target.status === 'rejected') setError(t('pipeline.deepl.languagesUnavailable'));
      });
    return () => { current = false; };
  }, [active, t]);
  const source = value.sourceLang ?? '';
  const target = value.targetLang ?? '';
  const options = (languages: DeeplLanguageInfo[], selected: string, empty: string) => [
    { value: '', label: empty },
    ...(selected && !languages.some((language) => language.language === selected) ? [{ value: selected, label: selected }] : []),
    ...languages.map((language) => ({ value: language.language, label: language.name })),
  ];
  const swapSource = target.split('-')[0];
  const canSwap = Boolean(source && target && sources.some((language) => language.language === swapSource)
    && targets.some((language) => language.language === source));
  const swapLabel = t('pipeline.swapLanguages');
  return <PanelSection icon={Network} label={t('pipeline.deepl.languagePair')} hint={disabledReason ?? t('pipeline.deepl.languagePairHint')}>
    <div className="flex min-w-0 items-center gap-2">
      <Select size="md" className="min-w-0 flex-1" value={source} disabled={Boolean(disabledReason)}
        ariaLabel={t('pipeline.sourceLanguage')} options={options(sources, source, t('pipeline.deepl.detectSource'))}
        onChange={(sourceLang) => onChange({ ...value, sourceLang, glossaryId: undefined })} />
      <IconButton size="sm" className="shrink-0" disabled={Boolean(disabledReason) || !canSwap}
        title={disabledReason ? `${swapLabel} — ${disabledReason}` : canSwap ? swapLabel : `${swapLabel} — ${t('pipeline.deepl.swapUnavailable')}`}
        onClick={() => onChange({ ...value, sourceLang: swapSource, targetLang: source, glossaryId: undefined, formality: 'default' })}>
        <ArrowRightLeft size={14} />
      </IconButton>
      <Select size="md" className="min-w-0 flex-1" value={target} disabled={Boolean(disabledReason)}
        ariaLabel={t('pipeline.targetLanguage')} options={options(targets, target, t('pipeline.deepl.chooseTarget'))}
        onChange={(targetLang) => onChange({ ...value, targetLang, glossaryId: undefined, formality: 'default' })} />
    </div>
    {active && error && <p role="alert" className="text-xs text-editorial-danger">{error}</p>}
  </PanelSection>;
}
