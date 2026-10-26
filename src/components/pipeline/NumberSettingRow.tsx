import { FIELD_NUMBER_CLASSNAME, SettingRow } from '../ui';

/** Valori a sei cifre (token di contesto) non stanno nel campo numerico breve. */
const WIDE_FIELD_CLASSNAME = FIELD_NUMBER_CLASSNAME.replace('w-16', 'w-24');

interface NumberSettingRowProps {
  label: string;
  hint?: string;
  value: number | string;
  onChange: (raw: string) => void;
  /** Unità di misura, nella sua colonna fissa accanto al campo. */
  unit?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
  placeholder?: string;
  disabled?: boolean;
  wide?: boolean;
}

/** Riga di impostazione con un numero: etichetta, campo allineato a destra e
 *  colonna dell'unità, sempre presente perché le cifre si incolonnino. */
export function NumberSettingRow({
  label,
  hint,
  value,
  onChange,
  unit,
  min,
  max,
  step,
  placeholder,
  disabled = false,
  wide = false,
}: NumberSettingRowProps) {
  return (
    <SettingRow label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={wide ? WIDE_FIELD_CLASSNAME : FIELD_NUMBER_CLASSNAME}
      />
      <span className="w-16 text-xs text-editorial-muted">{unit ?? ''}</span>
    </SettingRow>
  );
}
