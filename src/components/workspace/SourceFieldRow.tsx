import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, PenLine, Undo2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Select, Tooltip, type SelectOption } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

interface SourceFieldRowProps {
  label: string;
  /** Il valore da mostrare: la correzione se c'è, altrimenti quello della biblioteca. */
  value: string;
  /**
   * Il valore da correggere, quando è diverso da come si legge: il tipo
   * dell'opera si mostra tradotto («Manoscritto») ma si salva com'è nei dati
   * («manuscript»). Senza questa distinzione si salverebbe l'etichetta.
   */
  editableValue?: string;
  /** Presente solo se il campo è stato corretto: è il valore originale. */
  original?: string;
  /** Valori ammessi, quando il campo è una scelta e non testo libero. */
  options?: SelectOption[];
  onSave: (value: string | null) => Promise<void>;
}

/**
 * Una riga di dati dell'opera che si può correggere a mano.
 *
 * Il segno di «corretto» sta accanto all'etichetta e porta l'originale nel
 * tooltip: la riga resta leggibile a colpo d'occhio, e chi vuole sapere cosa
 * diceva la biblioteca non deve aprire nient'altro.
 */
export function SourceFieldRow({
  label,
  value,
  editableValue,
  original,
  options,
  onSave,
}: SourceFieldRowProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editableValue ?? value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Il campo appena aperto prende il fuoco: chi ha cliccato «correggi» sta già
  // per scrivere, e cercare il campo col mouse sarebbe un passaggio in più.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setDraft(editableValue ?? value);
    setEditing(true);
  };

  const save = async (next: string | null) => {
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Il motivo lo racconta chi salva, con un messaggio a schermo. Qui conta
      // solo non chiudere il campo: chiuderlo direbbe che è andata bene.
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
          {label}
        </dt>
        <dd className="flex min-w-0 flex-1 items-center justify-end gap-1">
          {options ? (
            <Select
              value={draft}
              onChange={setDraft}
              options={options}
              ariaLabel={label}
              // Invio ed Esc valgono anche sulla scelta, come sul campo scritto.
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save(draft);
                if (event.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save(draft);
                if (event.key === 'Escape') setEditing(false);
              }}
              aria-label={label}
              className={`${FIELD_CLASSNAME} max-w-xs py-1 text-sm`}
            />
          )}
          <IconButton
            size="sm"
            tone="accent"
            disabled={saving}
            onClick={() => void save(draft)}
            title={t('areas.library.fieldSave')}
          >
            <Check size={13} />
          </IconButton>
          <IconButton
            size="sm"
            disabled={saving}
            onClick={() => setEditing(false)}
            title={t('areas.library.fieldCancel')}
          >
            <X size={13} />
          </IconButton>
        </dd>
      </div>
    );
  }

  return (
    <div className="group flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
        {label}
        {original !== undefined && (
          <Tooltip
            label={t('areas.library.fieldCorrectedFrom', {
              value: original || t('areas.library.fieldEmptyOriginal'),
            })}
            side="right"
          >
            <span
              className="inline-flex cursor-help text-editorial-accent"
              aria-label={t('areas.library.fieldCorrectedFrom', {
                value: original || t('areas.library.fieldEmptyOriginal'),
              })}
            >
              <PenLine size={10} />
            </span>
          </Tooltip>
        )}
      </dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className="truncate font-display text-sm italic text-editorial-ink">
          {value || '—'}
        </span>
        {original !== undefined && (
          <IconButton
            size="xs"
            onClick={() => void save(null)}
            disabled={saving}
            title={t('areas.library.fieldRestoreOriginal')}
          >
            <Undo2 size={12} />
          </IconButton>
        )}
        <IconButton
          size="xs"
          onClick={startEditing}
          title={t('areas.library.fieldEdit', { field: label })}
        >
          <Pencil size={12} />
        </IconButton>
      </dd>
    </div>
  );
}
