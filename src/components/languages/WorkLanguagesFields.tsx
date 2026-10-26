import { useTranslation } from 'react-i18next';
import { BookOpen, Feather, Languages, ListTree, X, type LucideIcon } from 'lucide-react';
import { IconButton, SearchPicker, SectionLabel, SettingRow, type SearchPickerGroup } from '../ui';
import { FIELD_INLINE_CLASSNAME } from '../ui/fieldStyles';
import { SECTION_SETTING_LIST_CLASSNAME } from '../ui/panelStyles';
import {
  languageName,
  languageNameOf,
  searchLanguages,
  searchVarieties,
  varietyNameOf,
  type LanguageCatalog,
  type LanguageEntry,
} from '../../languages/catalog';
import type { LanguageChoice, WorkLanguages } from '../../types';

interface WorkLanguagesFieldsProps {
  catalog: LanguageCatalog | null;
  value: WorkLanguages;
  onChange: (next: WorkLanguages) => void;
  /** Codes already used by works of the workspace: listed first. */
  usedCodes: readonly string[];
  disabled?: boolean;
  /** Side by side, where height is short (the import dialog); stacked otherwise. */
  layout?: 'stacked' | 'columns';
}

/** Source and target of a work: language (ISO 639-3), variety (Glottolog) and note, each optional. */
export function WorkLanguagesFields({ catalog, value, onChange, usedCodes, disabled = false, layout = 'stacked' }: WorkLanguagesFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className={layout === 'columns' ? 'grid grid-cols-2 gap-x-8 gap-y-5' : 'space-y-5'}>
      <LanguageSide icon={BookOpen} label={t('workLanguages.source')} hint={t('workLanguages.sourceHint')}
        catalog={catalog} choice={value.source} usedCodes={usedCodes} disabled={disabled}
        onChange={(source) => onChange({ ...value, source })} />
      <LanguageSide icon={Feather} label={t('workLanguages.target')} hint={t('workLanguages.targetHint')}
        catalog={catalog} choice={value.target} usedCodes={usedCodes} disabled={disabled}
        onChange={(target) => onChange({ ...value, target })} />
    </div>
  );
}

function LanguageSide({ icon, label, hint, catalog, choice, usedCodes, disabled, onChange }: {
  icon: LucideIcon;
  label: string;
  hint: string;
  catalog: LanguageCatalog | null;
  choice: LanguageChoice;
  usedCodes: readonly string[];
  disabled: boolean;
  onChange: (next: LanguageChoice) => void;
}) {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.language;
  const varieties = catalog && choice.code ? catalog.varietiesOf(choice.code) : [];
  const toItems = (entries: LanguageEntry[]) => entries.map((entry) => ({ id: entry.code, label: languageName(entry, uiLanguage), detail: entry.code }));
  const searchLanguageGroups = (query: string): SearchPickerGroup[] => {
    if (!catalog) return [];
    const groups = searchLanguages(catalog, query, uiLanguage, usedCodes);
    return [
      { id: 'used', label: t('workLanguages.groupUsed'), items: toItems(groups.used) },
      { id: 'historical', label: t('workLanguages.groupHistorical'), items: toItems(groups.historical) },
      { id: 'other', label: t('workLanguages.groupAll'), items: toItems(groups.other) },
    ];
  };
  const searchVarietyGroups = (query: string): SearchPickerGroup[] => (catalog && choice.code
    ? [{ id: 'varieties', label: t('workLanguages.groupVarieties'), items: searchVarieties(catalog, choice.code, query).map((entry) => ({ id: entry.code, label: entry.name, detail: entry.code })) }]
    : []);
  const varietyBlockedReason = !choice.code
    ? t('workLanguages.varietyNeedsLanguage')
    : varieties.length === 0 ? t('workLanguages.noVarieties') : null;
  const blocked = (command: string, reason: string | null) =>
    reason ? t('transcription.commandBlocked', { command, reason }) : command;
  const loadingReason = catalog ? null : t('workLanguages.loading');

  return (
    <section className="space-y-1">
      <SectionLabel icon={icon} label={label} hint={hint} />
      <div className={SECTION_SETTING_LIST_CLASSNAME}>
        <SettingRow label={t('workLanguages.language')} hint={t('workLanguages.languageHint')}>
          <ChosenValue name={choice.code ? languageNameOf(catalog, choice.code, uiLanguage) : null} code={choice.code} />
          <SearchPicker icon={<Languages size={14} />} title={blocked(t('workLanguages.chooseLanguage'), loadingReason)}
            disabled={disabled || !catalog} searchLabel={t('workLanguages.searchLanguage')} search={searchLanguageGroups}
            emptyQueryHint={t('workLanguages.typeToSearchAll')} noResults={t('workLanguages.noResults')}
            onPick={(code) => onChange({ ...choice, code, variety: code === choice.code ? choice.variety : null })} />
          <IconButton size="sm" title={t('workLanguages.clearLanguage')} disabled={disabled || !choice.code}
            onClick={() => onChange({ ...choice, code: null, variety: null })}><X size={14} /></IconButton>
        </SettingRow>
        <SettingRow label={t('workLanguages.variety')} hint={t('workLanguages.varietyHint')}>
          <ChosenValue name={choice.variety ? varietyNameOf(catalog, choice.variety) : null} code={choice.variety} />
          <SearchPicker icon={<ListTree size={14} />} title={blocked(t('workLanguages.chooseVariety'), varietyBlockedReason ?? loadingReason)}
            disabled={disabled || Boolean(varietyBlockedReason) || !catalog} searchLabel={t('workLanguages.searchVariety')}
            search={searchVarietyGroups} noResults={t('workLanguages.noResults')}
            onPick={(variety) => onChange({ ...choice, variety })} />
          <IconButton size="sm" title={t('workLanguages.clearVariety')} disabled={disabled || !choice.variety}
            onClick={() => onChange({ ...choice, variety: null })}><X size={14} /></IconButton>
        </SettingRow>
        <SettingRow label={t('workLanguages.note')} hint={t('workLanguages.noteHint')}>
          <input value={choice.note} disabled={disabled} onChange={(event) => onChange({ ...choice, note: event.target.value })}
            placeholder={t('workLanguages.notePlaceholder')} aria-label={t('workLanguages.note')}
            className={`${FIELD_INLINE_CLASSNAME} w-64`} />
        </SettingRow>
      </div>
    </section>
  );
}

function ChosenValue({ name, code }: { name: string | null; code: string | null }) {
  const { t } = useTranslation();
  if (!name || !code) return <span className="text-sm italic text-editorial-muted">{t('workLanguages.notSpecified')}</span>;
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="max-w-48 truncate font-display text-base text-editorial-ink">{name}</span>
      <span className="font-mono text-xs text-editorial-muted">{code}</span>
    </span>
  );
}
