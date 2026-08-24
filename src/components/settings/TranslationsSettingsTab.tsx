import type { ReactNode } from 'react';
import { Scissors, Layers, LayoutTemplate, Palette, Sparkles, Columns2, BookOpen, ChevronsLeft, Copy, RotateCcw, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HLColorSet } from '../../stores/uiStore';
import {
  FieldLabel,
  FIELD_MONO_CLASSNAME,
  SectionLabel,
  SegmentedControl,
  SettingRow,
} from '../ui';

const LAYOUT_OPTIONS: Array<{ value: 'auto' | 'standard' | 'book'; labelKey: string; icon: ReactNode }> = [
  { value: 'auto',     labelKey: 'document.layoutAuto',     icon: <Sparkles size={14} /> },
  { value: 'standard', labelKey: 'document.layoutStandard', icon: <Columns2 size={14} /> },
  { value: 'book',     labelKey: 'document.layoutBook',     icon: <BookOpen size={14} /> },
];

const PIPELINE_INIT_OPTIONS: Array<{ value: 'copy-first' | 'copy-previous' | 'defaults'; labelKey: string; icon: ReactNode }> = [
  { value: 'copy-first',    labelKey: 'settings.newPipelineInitCopyFirst',    icon: <ChevronsLeft size={14} /> },
  { value: 'copy-previous', labelKey: 'settings.newPipelineInitCopyPrevious', icon: <Copy size={14} /> },
  { value: 'defaults',      labelKey: 'settings.newPipelineInitDefaults',     icon: <RotateCcw size={14} /> },
];

function colorToHex(color: string | undefined): string {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((v) => parseInt(v).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

function applyHexToColor(existing: string | undefined, hex: string): string {
  const m = (existing ?? '').match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  if (m) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${m[1]})`;
  }
  return hex;
}

interface TranslationsSettingsTabProps {
  chunkPresetShort: number;
  chunkPresetMedium: number;
  chunkPresetLong: number;
  setChunkPresetShort: (value: number) => void;
  setChunkPresetMedium: (value: number) => void;
  setChunkPresetLong: (value: number) => void;
  newPipelineInit: 'copy-first' | 'copy-previous' | 'defaults';
  setNewPipelineInit: (value: 'copy-first' | 'copy-previous' | 'defaults') => void;
  documentLayout: 'auto' | 'standard' | 'book';
  setDocumentLayout: (value: 'auto' | 'standard' | 'book') => void;
  hlMode: 'light' | 'dark';
  activeHlColors: HLColorSet;
  setHighlightColor: (mode: 'light' | 'dark', key: keyof HLColorSet, value: string) => void;
}

export function TranslationsSettingsTab({
  chunkPresetShort,
  chunkPresetMedium,
  chunkPresetLong,
  setChunkPresetShort,
  setChunkPresetMedium,
  setChunkPresetLong,
  newPipelineInit,
  setNewPipelineInit,
  documentLayout,
  setDocumentLayout,
  hlMode,
  activeHlColors,
  setHighlightColor,
}: TranslationsSettingsTabProps) {
  const { t } = useTranslation();

  return (
    <div
      id="settings-panel-translations"
      role="tabpanel"
      aria-labelledby="settings-tab-translations"
      className="space-y-10"
    >
      {/* Segmentazione */}
      <section className="space-y-4">
        <SectionLabel icon={Scissors} label={t('settings.segmentation')} />
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="settings-chunk-preset-short" block>
              {t('settings.chunkPresetShort')}
            </FieldLabel>
            <input
              id="settings-chunk-preset-short"
              type="number"
              min={50}
              max={chunkPresetMedium - 50}
              step={50}
              value={chunkPresetShort}
              onChange={(e) => setChunkPresetShort(Number(e.target.value) || 50)}
              className={FIELD_MONO_CLASSNAME}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="settings-chunk-preset-medium" block>
              {t('settings.chunkPresetMedium')}
            </FieldLabel>
            <input
              id="settings-chunk-preset-medium"
              type="number"
              min={chunkPresetShort + 50}
              max={chunkPresetLong - 50}
              step={50}
              value={chunkPresetMedium}
              onChange={(e) => setChunkPresetMedium(Number(e.target.value) || 50)}
              className={FIELD_MONO_CLASSNAME}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="settings-chunk-preset-long" block>
              {t('settings.chunkPresetLong')}
            </FieldLabel>
            <input
              id="settings-chunk-preset-long"
              type="number"
              min={chunkPresetMedium + 50}
              step={50}
              value={chunkPresetLong}
              onChange={(e) => setChunkPresetLong(Number(e.target.value) || 50)}
              className={FIELD_MONO_CLASSNAME}
            />
          </div>
        </div>
      </section>

      {/* Inizializzazione nuova pipeline */}
      <section className="space-y-4">
        <SectionLabel icon={Layers} label={t('settings.newPipelineInit')} />
        {/* Lo stesso controllo del tema e dell'interlinea: le opzioni hanno un
            nome, quindi il nome si legge senza passare il mouse. */}
        <SegmentedControl
          ariaLabel={t('settings.newPipelineInit')}
          value={newPipelineInit}
          onChange={setNewPipelineInit}
          options={PIPELINE_INIT_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
            icon: opt.icon,
          }))}
        />
      </section>

      {/* Layout lettura */}
      <section className="space-y-4">
        <SectionLabel icon={LayoutTemplate} label={t('header.readerLayout')} />
        <SegmentedControl
          ariaLabel={t('header.readerLayout')}
          value={documentLayout}
          onChange={setDocumentLayout}
          options={LAYOUT_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
            icon: opt.icon,
          }))}
        />
      </section>

      {/* Evidenziazioni */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel icon={Palette} label={t('settings.highlights')} />
          {/* Quale tema si sta modificando: una didascalia, non una pastiglia —
              non è cliccabile e non deve sembrarlo. */}
          <span className="flex items-center gap-1 text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
            {hlMode === 'dark' ? <Moon size={10} /> : <Sun size={10} />}
            {t(hlMode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
          </span>
        </div>
        {([
          {
            groupLabel: t('settings.highlightsGlossaryGroup'),
            items: [
              { key: 'sourceTerm'   as const, label: t('settings.highlightSourceTerm') },
              { key: 'matchTerm'    as const, label: t('settings.highlightMatchTerm') },
              { key: 'mismatchTerm' as const, label: t('settings.highlightMismatchTerm') },
            ],
          },
          {
            groupLabel: t('settings.highlightsOtherGroup'),
            items: [
              { key: 'search'       as const, label: t('settings.highlightSearch') },
              { key: 'auditPhrase'  as const, label: t('settings.highlightAuditPhrase') },
              { key: 'annotation'   as const, label: t('settings.highlightAnnotation') },
            ],
          },
        ]).map(({ groupLabel, items }) => (
          <div key={groupLabel} className="space-y-1.5">
            <FieldLabel>{groupLabel}</FieldLabel>
            <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
              {items.map(({ key, label }) => (
                // La pastiglia del colore sta a destra come ogni altro comando
                // di riga, e l'etichetta ha il corpo delle altre etichette:
                // prima era la sola riga della finestra in corsivo a 18px.
                <SettingRow key={key} label={label}>
                  <label className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border border-editorial-border">
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: activeHlColors[key] }}
                    />
                    <input
                      type="color"
                      value={colorToHex(activeHlColors[key])}
                      onChange={(e) =>
                        setHighlightColor(
                          hlMode,
                          key,
                          applyHexToColor(activeHlColors[key], e.target.value),
                        )
                      }
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label={label}
                    />
                  </label>
                </SettingRow>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
