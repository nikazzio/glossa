import { ChevronsLeft, Copy, Layers, RotateCcw, Scissors } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/configStore';
import { FIELD_NUMBER_CLASSNAME, SettingRow, PanelSection, SECTION_SETTING_LIST_CLASSNAME } from '../ui';
import { SettingChoiceRow } from './SettingChoiceRow';

type PipelineInit = 'copy-first' | 'copy-previous' | 'defaults';

/** Passo e distanza minima fra i tre preset di segmentazione, in parole. */
const PRESET_STEP = 50;

/** Valori di partenza delle traduzioni: misura dei frammenti e nuove pipeline. */
export function TranslationsSettingsTab() {
  const { t } = useTranslation();
  const {
    chunkPresetShort, chunkPresetMedium, chunkPresetLong,
    setChunkPresetShort, setChunkPresetMedium, setChunkPresetLong,
    newPipelineInit, setNewPipelineInit,
  } = useConfigStore();
  const presets = [
    { id: 'short', labelKey: 'settings.chunkPresetShort', hintKey: 'settings.chunkPresetShortHint', value: chunkPresetShort,
      min: PRESET_STEP, max: chunkPresetMedium - PRESET_STEP, set: setChunkPresetShort },
    { id: 'medium', labelKey: 'settings.chunkPresetMedium', hintKey: 'settings.chunkPresetMediumHint', value: chunkPresetMedium,
      min: chunkPresetShort + PRESET_STEP, max: chunkPresetLong - PRESET_STEP, set: setChunkPresetMedium },
    { id: 'long', labelKey: 'settings.chunkPresetLong', hintKey: 'settings.chunkPresetLongHint', value: chunkPresetLong,
      min: chunkPresetMedium + PRESET_STEP, max: undefined, set: setChunkPresetLong },
  ];

  return (
    <div id="settings-panel-translations" role="tabpanel" aria-labelledby="settings-tab-translations" className="space-y-10">
      <PanelSection icon={Scissors} label={t('settings.segmentation')} hint={t('settings.segmentationHint')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          {presets.map((preset) => (
            <SettingRow key={preset.id} label={t(preset.labelKey)} hint={t(preset.hintKey)}>
              <input id={`settings-chunk-preset-${preset.id}`} type="number" step={PRESET_STEP} min={preset.min} max={preset.max}
                value={preset.value} aria-label={t(preset.labelKey)}
                onChange={(event) => preset.set(Number(event.target.value) || PRESET_STEP)}
                className={FIELD_NUMBER_CLASSNAME} />
              <span className="w-16 text-xs text-editorial-muted">{t('settings.wordsUnit')}</span>
            </SettingRow>
          ))}
        </div>
      </PanelSection>

      <PanelSection icon={Layers} label={t('settings.pipelinesSection')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <SettingChoiceRow<PipelineInit> label={t('settings.newPipelineInit')} hint={t('settings.newPipelineInitHint')}
            value={newPipelineInit} onChange={setNewPipelineInit}
            options={[
              { value: 'copy-first', label: t('settings.newPipelineInitCopyFirst'), content: <ChevronsLeft size={11} /> },
              { value: 'copy-previous', label: t('settings.newPipelineInitCopyPrevious'), content: <Copy size={11} /> },
              { value: 'defaults', label: t('settings.newPipelineInitDefaults'), content: <RotateCcw size={11} /> },
            ]} />
        </div>
      </PanelSection>
    </div>
  );
}
