import { Type, Sun, Moon, Monitor, Palette, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UiFont, DocumentFontSize, DocumentLineHeight, ColorScheme } from '../../stores/uiStore';
import { ContrastBadge, SegmentedControl } from '../ui';

/** Sfondo editoriale di riferimento per il controllo contrasto AA dell'accento. */
const ACCENT_CONTRAST_BG: Record<'light' | 'dark', string> = {
  light: '#F8F5F0',
  dark: '#1c1814',
};

// Anteprima resa nel font stesso: il preview è il nome del font, mostrato nel proprio carattere.
const UI_FONT_OPTIONS: Array<{ value: UiFont; name: string; family: string }> = [
  { value: 'jakarta', name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif' },
  { value: 'geist',   name: 'Geist',             family: '"Geist", sans-serif' },
  { value: 'inter',   name: 'Inter',             family: '"Inter", sans-serif' },
  { value: 'plex',    name: 'IBM Plex Sans',     family: '"IBM Plex Sans", sans-serif' },
];

interface TypographySettingsTabProps {
  uiFont: UiFont;
  setUiFont: (font: UiFont) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  editorialAccentColor: { light: string; dark: string };
  setEditorialAccentColor: (mode: 'light' | 'dark', hex: string) => void;
  documentFontSize: DocumentFontSize;
  setDocumentFontSize: (size: DocumentFontSize) => void;
  documentLineHeight: DocumentLineHeight;
  setDocumentLineHeight: (lineHeight: DocumentLineHeight) => void;
}

export function TypographySettingsTab({
  uiFont,
  setUiFont,
  colorScheme,
  setColorScheme,
  editorialAccentColor,
  setEditorialAccentColor,
  documentFontSize,
  setDocumentFontSize,
  documentLineHeight,
  setDocumentLineHeight,
}: TypographySettingsTabProps) {
  const { t } = useTranslation();

  return (
    <div
      id="settings-panel-typography"
      role="tabpanel"
      aria-labelledby="settings-tab-typography"
      className="space-y-10"
    >
      {/* Font UI */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <Type size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.uiFont')}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-editorial-muted">{t('settings.uiFontHint')}</p>
        <div role="radiogroup" aria-label={t('settings.uiFont')} className="grid grid-cols-2 gap-x-6 border-y border-editorial-border/70">
          {UI_FONT_OPTIONS.map((opt) => {
            const isActive = uiFont === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setUiFont(opt.value)}
                className={`flex items-center justify-between gap-2 border-l-4 py-3.5 pl-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                  isActive
                    ? 'border-l-editorial-accent text-editorial-accent'
                    : 'border-l-transparent text-editorial-ink hover:border-l-editorial-border hover:text-editorial-accent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-lg" style={{ fontFamily: opt.family }}>
                    {opt.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-editorial-muted" style={{ fontFamily: opt.family }}>
                    AaBbCc 0123 àèéìòù
                  </span>
                </span>
                {isActive ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-accent" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tema colori */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Sun size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.colorScheme')}
          </p>
        </div>
        <SegmentedControl
          ariaLabel={t('settings.colorScheme')}
          value={colorScheme}
          onChange={setColorScheme}
          options={[
            { value: 'light' as ColorScheme, icon: <Sun size={14} />, label: t('settings.colorScheme_light') },
            { value: 'dark' as ColorScheme, icon: <Moon size={14} />, label: t('settings.colorScheme_dark') },
            { value: 'system' as ColorScheme, icon: <Monitor size={14} />, label: t('settings.colorScheme_system') },
          ]}
        />
      </div>

      {/* Accento */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Palette size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.accentColor')}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-editorial-muted">{t('settings.accentColorHint')}</p>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((mode) => (
            <label
              key={mode}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-editorial-border bg-editorial-bg/60 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted transition-colors hover:border-editorial-accent/40"
            >
              <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full">
                <span className="absolute inset-0" style={{ backgroundColor: editorialAccentColor[mode] }} />
                <input
                  type="color"
                  value={editorialAccentColor[mode]}
                  onChange={(e) => setEditorialAccentColor(mode, e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t(mode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
                />
              </span>
              {t(mode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
              <ContrastBadge fg={editorialAccentColor[mode]} bg={ACCENT_CONTRAST_BG[mode]} />
            </label>
          ))}
        </div>
      </div>

      {/* Dimensione testo documento */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Type size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.docFontSize')}
          </p>
        </div>
        <SegmentedControl
          ariaLabel={t('settings.docFontSize')}
          value={documentFontSize}
          onChange={setDocumentFontSize}
          options={(['sm', 'md', 'lg'] as DocumentFontSize[]).map((size) => ({
            value: size,
            label: t(`settings.docFontSize_${size}`),
          }))}
        />
      </div>

      {/* Interlinea documento */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.docLineHeight')}
          </p>
        </div>
        <SegmentedControl
          ariaLabel={t('settings.docLineHeight')}
          value={documentLineHeight}
          onChange={setDocumentLineHeight}
          options={(['tight', 'normal', 'relaxed'] as DocumentLineHeight[]).map((lh) => ({
            value: lh,
            label: t(`settings.docLineHeight_${lh}`),
          }))}
        />
      </div>
    </div>
  );
}
