import { BookMarked, Highlighter, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HL_COLORS_DARK, HL_COLORS_LIGHT, useUiStore, type HLColorSet } from '../../stores/uiStore';
import { PanelSection, SECTION_SETTING_LIST_CLASSNAME, SettingRow } from '../ui';
import { ColorSwatchInput } from './ColorSwatchInput';
import { useColorMode } from './useColorMode';

function colorToHex(color: string | undefined): string {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((v) => parseInt(v).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

/** Un colore con trasparenza tiene la sua trasparenza: cambia solo la tinta. */
function applyHexToColor(existing: string | undefined, hex: string): string {
  const m = (existing ?? '').match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  if (!m) return hex;
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgba(${r},${g},${b},${m[1]})`;
}

const GROUPS: Array<{ labelKey: string; icon: LucideIcon; items: Array<{ key: keyof HLColorSet; labelKey: string }> }> = [
  {
    labelKey: 'settings.highlightsGlossaryGroup',
    icon: BookMarked,
    items: [
      { key: 'sourceTerm', labelKey: 'settings.highlightSourceTerm' },
      { key: 'matchTerm', labelKey: 'settings.highlightMatchTerm' },
      { key: 'mismatchTerm', labelKey: 'settings.highlightMismatchTerm' },
    ],
  },
  {
    labelKey: 'settings.highlightsOtherGroup',
    icon: Highlighter,
    items: [
      { key: 'search', labelKey: 'settings.highlightSearch' },
      { key: 'auditPhrase', labelKey: 'settings.highlightAuditPhrase' },
      { key: 'annotation', labelKey: 'settings.highlightAnnotation' },
    ],
  },
];

/** Colori delle evidenziazioni nel testo, per il tema in uso. */
export function HighlightColorsSection() {
  const { t } = useTranslation();
  const highlightColors = useUiStore((s) => s.highlightColors);
  const setHighlightColor = useUiStore((s) => s.setHighlightColor);
  const mode = useColorMode();
  // Chiave per chiave: uno stato salvato incompleto non deve lasciare una pastiglia vuota.
  const colors: HLColorSet = { ...(mode === 'dark' ? HL_COLORS_DARK : HL_COLORS_LIGHT), ...highlightColors[mode] };

  return (
    <>
      {GROUPS.map(({ labelKey, icon, items }, index) => (
        <PanelSection key={labelKey} icon={icon} label={t(labelKey)}
          actions={index === 0 && (
            // Quale tema si sta modificando: una didascalia, non un comando.
            <span className="flex items-center gap-1 caption-label">
              {mode === 'dark' ? <Moon size={10} /> : <Sun size={10} />}
              {t(mode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
            </span>
          )}>
          <div className={SECTION_SETTING_LIST_CLASSNAME}>
            {items.map(({ key, labelKey: itemKey }) => (
              <SettingRow key={key} label={t(itemKey)}>
                <ColorSwatchInput color={colors[key]} value={colorToHex(colors[key])} label={t(itemKey)}
                  onChange={(hex) => setHighlightColor(mode, key, applyHexToColor(colors[key], hex))} />
              </SettingRow>
            ))}
          </div>
        </PanelSection>
      ))}
    </>
  );
}
