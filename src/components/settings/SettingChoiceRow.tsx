import { ChoiceDots, SettingRow, type ChoiceDotsOption } from '../ui';

/**
 * Riga d'impostazione con una scelta esclusiva a cerchietti: il nome
 * dell'opzione scelta si legge accanto, gli altri nel suggerimento.
 */
export function SettingChoiceRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: ChoiceDotsOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <span className="font-display text-sm italic text-editorial-ink">
        {options.find((option) => option.value === value)?.label}
      </span>
      <ChoiceDots options={options} value={value} onChange={onChange} ariaLabel={label} />
    </SettingRow>
  );
}
