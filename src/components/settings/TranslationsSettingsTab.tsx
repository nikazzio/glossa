import type { ReactNode } from 'react';
import { Scissors, Layers, LayoutTemplate, Palette, Sparkles, Columns2, BookOpen, ChevronsLeft, Copy, RotateCcw, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HLColorSet } from '../../stores/uiStore';
import { IconButton } from '../ui';

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

function NavSelector<T extends string>({
  options,
  value,
  onChange,
  getLabel,
  ariaLabel,
}: {
  options: Array<{ value: T; icon: ReactNode; labelKey: string }>;
  value: T;
  onChange: (v: T) => void;
  getLabel: (labelKey: string) => string;
  ariaLabel?: string;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex items-center gap-2">
      {options.map((opt) => {
        const isActive = value === opt.value;
        const label = getLabel(opt.labelKey);
        return (
          <IconButton
            key={opt.value}
            size="md"
            tone={isActive ? 'accent' : 'default'}
            onClick={() => onChange(opt.value)}
            title={label}
            role="radio"
            aria-checked={isActive}
          >
            {opt.icon}
          </IconButton>
        );
      })}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {active ? getLabel(active.labelKey) : ''}
      </span>
    </div>
  );
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
      className="space-y-12"
    >
      {/* Segmentazione */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Scissors size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.segmentation')}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="settings-chunk-preset-short" className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('settings.chunkPresetShort')}
            </label>
            <input
              id="settings-chunk-preset-short"
              type="number"
              min={50}
              max={chunkPresetMedium - 50}
              step={50}
              value={chunkPresetShort}
              onChange={(e) => setChunkPresetShort(Number(e.target.value) || 50)}
              className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="settings-chunk-preset-medium" className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('settings.chunkPresetMedium')}
            </label>
            <input
              id="settings-chunk-preset-medium"
              type="number"
              min={chunkPresetShort + 50}
              max={chunkPresetLong - 50}
              step={50}
              value={chunkPresetMedium}
              onChange={(e) => setChunkPresetMedium(Number(e.target.value) || 50)}
              className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="settings-chunk-preset-long" className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('settings.chunkPresetLong')}
            </label>
            <input
              id="settings-chunk-preset-long"
              type="number"
              min={chunkPresetMedium + 50}
              step={50}
              value={chunkPresetLong}
              onChange={(e) => setChunkPresetLong(Number(e.target.value) || 50)}
              className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        </div>
      </div>

      {/* Inizializzazione nuova pipeline */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <Layers size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.newPipelineInit')}
          </p>
        </div>
        <NavSelector
          options={PIPELINE_INIT_OPTIONS}
          value={newPipelineInit}
          onChange={setNewPipelineInit}
          getLabel={(key) => t(key)}
          ariaLabel={t('settings.newPipelineInit')}
        />
      </div>

      {/* Layout lettura */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('header.readerLayout')}
          </p>
        </div>
        <NavSelector
          options={LAYOUT_OPTIONS}
          value={documentLayout}
          onChange={setDocumentLayout}
          getLabel={(key) => t(key)}
          ariaLabel={t('header.readerLayout')}
        />
      </div>

      {/* Evidenziazioni */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Palette size={11} className="text-editorial-accent shrink-0" />
            <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('settings.highlights')}
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-editorial-border px-2 py-0.5 text-[11px] font-sans text-editorial-muted">
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
            <p className="text-[10px] font-sans uppercase tracking-[0.14em] text-editorial-muted/70">
              {groupLabel}
            </p>
            <div className="divide-y divide-editorial-border/70 border-y border-editorial-border/70">
              {items.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 py-3.5 transition-colors hover:text-editorial-accent"
                >
                  <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full shadow-sm">
                    <div className="absolute inset-0" style={{ backgroundColor: activeHlColors[key] }} />
                    <input
                      type="color"
                      value={colorToHex(activeHlColors[key])}
                      onChange={(e) => setHighlightColor(hlMode, key, applyHexToColor(activeHlColors[key], e.target.value))}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label={label}
                    />
                  </div>
                  <span className="mx-0.5 h-5 w-px shrink-0 bg-editorial-border/70" aria-hidden="true" />
                  <span className="font-display text-lg italic text-editorial-ink">{label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
