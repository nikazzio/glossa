import { useState } from 'react';
import { BookOpen, Columns2, FileText, Highlighter, Monitor, Moon, Palette, Sparkles, Sun, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EDITORIAL_BG, useUiStore, type ColorScheme, type DocumentFontSize, type DocumentLineHeight, type UiFont } from '../../stores/uiStore';
import type { DocumentLayoutPreference } from '../../types';
import { ContrastBadge, Select, SettingRow, type TabStripItem, PanelSection, SECTION_SETTING_LIST_CLASSNAME } from '../ui';
import { ColorSwatchInput } from './ColorSwatchInput';
import { HighlightColorsSection } from './HighlightColorsSection';
import { SettingChoiceRow } from './SettingChoiceRow';
import { SettingsSubTabs } from './SettingsSubTabs';

type AppearanceSubTab = 'interface' | 'document' | 'highlights';

// Anteprima resa nel font stesso: il nome del carattere, scritto con quel carattere.
const UI_FONT_OPTIONS: Array<{ value: UiFont; name: string; family: string }> = [
  { value: 'jakarta', name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif' },
  { value: 'geist', name: 'Geist', family: '"Geist", sans-serif' },
  { value: 'inter', name: 'Inter', family: '"Inter", sans-serif' },
  { value: 'plex', name: 'IBM Plex Sans', family: '"IBM Plex Sans", sans-serif' },
];

const FONT_SIZES: DocumentFontSize[] = ['sm', 'md', 'lg'];
const LINE_HEIGHTS: DocumentLineHeight[] = ['tight', 'normal', 'relaxed'];

/** Aspetto dell'app: interfaccia, testo dei documenti, colori delle evidenziazioni. */
export function AppearanceSettingsTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<AppearanceSubTab>('interface');
  const tabs: TabStripItem[] = [
    { id: 'interface', label: t('settings.appearance.interface'), icon: <Monitor size={16} /> },
    { id: 'document', label: t('settings.appearance.document'), icon: <FileText size={16} /> },
    { id: 'highlights', label: t('settings.highlights'), icon: <Highlighter size={16} /> },
  ];
  return (
    <SettingsSubTabs tabId="appearance" ariaLabel={t('settings.appearanceTab')} tabs={tabs} activeId={subTab}
      onChange={(id) => setSubTab(id as AppearanceSubTab)}>
      {subTab === 'interface' && <InterfaceSections />}
      {subTab === 'document' && <DocumentSection />}
      {subTab === 'highlights' && <HighlightColorsSection />}
    </SettingsSubTabs>
  );
}

function InterfaceSections() {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme, editorialAccentColor, setEditorialAccentColor, uiFont, setUiFont } = useUiStore();
  return (
    <>
      <PanelSection icon={Palette} label={t('settings.appearance.colors')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <SettingChoiceRow<ColorScheme> label={t('settings.colorScheme')} value={colorScheme} onChange={setColorScheme}
            options={[
              { value: 'light', label: t('settings.colorScheme_light'), content: <Sun size={11} /> },
              { value: 'dark', label: t('settings.colorScheme_dark'), content: <Moon size={11} /> },
              { value: 'system', label: t('settings.colorScheme_system'), content: <Monitor size={11} /> },
            ]} />
          {(['light', 'dark'] as const).map((mode) => {
            const label = t('settings.accentColorFor', { scheme: t(`settings.colorScheme_${mode}`) });
            return (
              <SettingRow key={mode} label={label} hint={t('settings.accentColorHint')}>
                <ContrastBadge fg={editorialAccentColor[mode]} bg={EDITORIAL_BG[mode]} />
                <ColorSwatchInput color={editorialAccentColor[mode]} value={editorialAccentColor[mode]} label={label}
                  onChange={(hex) => setEditorialAccentColor(mode, hex)} />
              </SettingRow>
            );
          })}
        </div>
      </PanelSection>
      <PanelSection icon={Type} label={t('settings.uiFont')} hint={t('settings.uiFontHint')}>
        {/* Ogni nome è scritto nel proprio carattere: è l'anteprima. */}
        <div role="radiogroup" aria-label={t('settings.uiFont')} className={SECTION_SETTING_LIST_CLASSNAME}>
          {UI_FONT_OPTIONS.map((option) => {
            const isActive = uiFont === option.value;
            return (
              <button key={option.value} type="button" role="radio" aria-checked={isActive} onClick={() => setUiFont(option.value)}
                className={`flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                  isActive ? 'text-editorial-accent' : 'text-editorial-ink hover:text-editorial-accent'}`}
                style={{ fontFamily: option.family }}>
                <span>{option.name}</span>
                {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-accent" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </PanelSection>
    </>
  );
}

function DocumentSection() {
  const { t } = useTranslation();
  const { documentFontSize, setDocumentFontSize, documentLineHeight, setDocumentLineHeight, documentLayout, setDocumentLayout } = useUiStore();
  return (
    <PanelSection icon={FileText} label={t('settings.appearance.documentText')}>
      <div className={SECTION_SETTING_LIST_CLASSNAME}>
        <SettingRow label={t('settings.docFontSize')}>
          <Select size="md" value={documentFontSize} ariaLabel={t('settings.docFontSize')}
            onChange={(value) => setDocumentFontSize(value as DocumentFontSize)}
            options={FONT_SIZES.map((size) => ({ value: size, label: t(`settings.docFontSize_${size}`) }))} />
        </SettingRow>
        <SettingRow label={t('settings.docLineHeight')}>
          <Select size="md" value={documentLineHeight} ariaLabel={t('settings.docLineHeight')}
            onChange={(value) => setDocumentLineHeight(value as DocumentLineHeight)}
            options={LINE_HEIGHTS.map((height) => ({ value: height, label: t(`settings.docLineHeight_${height}`) }))} />
        </SettingRow>
        <SettingChoiceRow<DocumentLayoutPreference> label={t('header.readerLayout')} hint={t('settings.appearance.layoutHint')}
          value={documentLayout} onChange={setDocumentLayout}
          options={[
            { value: 'auto', label: t('document.layoutAuto'), content: <Sparkles size={11} /> },
            { value: 'standard', label: t('document.layoutStandard'), content: <Columns2 size={11} /> },
            { value: 'book', label: t('document.layoutBook'), content: <BookOpen size={11} /> },
          ]} />
      </div>
    </PanelSection>
  );
}
