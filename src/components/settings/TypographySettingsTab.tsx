import { Type, Sun, Moon, Monitor, Palette, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UiFont, DocumentFontSize, DocumentLineHeight, ColorScheme } from '../../stores/uiStore';
import { ContrastBadge, SectionLabel, SegmentedControl, SettingRow } from '../ui';

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
      <section className="space-y-4">
        <SectionLabel icon={Type} label={t('settings.uiFont')} />
        <p className="text-sm leading-relaxed text-editorial-muted">{t('settings.uiFontHint')}</p>
        {/* Righe come ogni altro elenco della finestra: l'anteprima resta —
            il nome è reso nel proprio carattere — ma spariscono la barra
            laterale e l'altezza di riga che aveva solo questa scheda. */}
        <div
          role="radiogroup"
          aria-label={t('settings.uiFont')}
          className="divide-y divide-editorial-border/60 border-y border-editorial-border/70"
        >
          {UI_FONT_OPTIONS.map((opt) => {
            const isActive = uiFont === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setUiFont(opt.value)}
                className={`flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                  isActive
                    ? 'text-editorial-accent'
                    : 'text-editorial-ink hover:text-editorial-accent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm" style={{ fontFamily: opt.family }}>
                    {opt.name}
                  </span>
                  <span
                    className="mt-0.5 block text-xs text-editorial-muted"
                    style={{ fontFamily: opt.family }}
                  >
                    AaBbCc 0123 àèéìòù
                  </span>
                </span>
                {isActive ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-accent"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Tema colori */}
      <section className="space-y-4">
        <SectionLabel icon={Sun} label={t('settings.colorScheme')} />
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
      </section>

      {/* Accento */}
      <section className="space-y-4">
        <SectionLabel icon={Palette} label={t('settings.accentColor')} />
        {/* Righe, non due riquadri che somigliavano a un selettore: qui non si
            scegliono due alternative, si impostano due valori. */}
        <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
          {(['light', 'dark'] as const).map((mode) => {
            const label = t(
              mode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light',
            );
            return (
              <SettingRow key={mode} label={label} hint={t('settings.accentColorHint')}>
                <span className="flex items-center gap-2">
                  <ContrastBadge fg={editorialAccentColor[mode]} bg={ACCENT_CONTRAST_BG[mode]} />
                  <label className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border border-editorial-border">
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: editorialAccentColor[mode] }}
                    />
                    <input
                      type="color"
                      value={editorialAccentColor[mode]}
                      onChange={(e) => setEditorialAccentColor(mode, e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label={label}
                    />
                  </label>
                </span>
              </SettingRow>
            );
          })}
        </div>
      </section>

      {/* Dimensione testo documento */}
      <section className="space-y-4">
        <SectionLabel icon={Type} label={t('settings.docFontSize')} />
        <SegmentedControl
          ariaLabel={t('settings.docFontSize')}
          value={documentFontSize}
          onChange={setDocumentFontSize}
          options={(['sm', 'md', 'lg'] as DocumentFontSize[]).map((size) => ({
            value: size,
            label: t(`settings.docFontSize_${size}`),
          }))}
        />
      </section>

      {/* Interlinea documento */}
      <section className="space-y-4">
        <SectionLabel icon={SlidersHorizontal} label={t('settings.docLineHeight')} />
        <SegmentedControl
          ariaLabel={t('settings.docLineHeight')}
          value={documentLineHeight}
          onChange={setDocumentLineHeight}
          options={(['tight', 'normal', 'relaxed'] as DocumentLineHeight[]).map((lh) => ({
            value: lh,
            label: t(`settings.docLineHeight_${lh}`),
          }))}
        />
      </section>
    </div>
  );
}
