import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Hint } from './Hint';
import { Tooltip, type TooltipSide } from './Tooltip';

export interface ChoiceDotsOption<T extends string> {
  value: T;
  /** Nome della scelta: suggerimento al passaggio e nome per chi legge con la voce. */
  label: string;
  /** Il segno dentro il cerchietto: un'icona da 11 px o una lettera. */
  content: ReactNode;
  /** Scelta non disponibile: resta visibile, il motivo va nell'etichetta, e
   *  le frecce la saltano. */
  disabled?: boolean;
}

interface ChoiceDotsProps<T extends string> {
  options: ChoiceDotsOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Icona di categoria davanti ai cerchietti: spiega il gruppo con `ariaLabel`. */
  categoryIcon?: LucideIcon;
  tooltipSide?: TooltipSide;
}

const DOT_CLASSNAME =
  'flex h-6 w-6 items-center justify-center rounded-full border text-caption font-bold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';
const DOT_CHOSEN_CLASSNAME = 'border-editorial-accent bg-editorial-accent text-on-accent';
const DOT_IDLE_CLASSNAME =
  'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent';

/**
 * Scelta esclusiva fra pochi cerchietti con icona (livello di ragionamento,
 * immagine inviata dall'OCR): un `radiogroup` con le frecce che spostano la
 * scelta e il fuoco insieme, come vuole il modello ARIA.
 */
export function ChoiceDots<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  categoryIcon: CategoryIcon,
  tooltipSide = 'top',
}: ChoiceDotsProps<T>) {
  const buttonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  // Se il valore non è fra le scelte mostrate, il tabulatore entra dalla prima.
  const tabbableValue = options.some((option) => option.value === value) ? value : options[0]?.value;

  const handleKeyDown = (current: T, event: KeyboardEvent<HTMLButtonElement>) => {
    const enabled = options.filter((option) => !option.disabled);
    const index = enabled.findIndex((option) => option.value === current);
    const total = enabled.length;
    if (total === 0) return;
    const nextIndex =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index - 1 + total) % total
        : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % total
          : event.key === 'Home' ? 0
            : event.key === 'End' ? total - 1
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = enabled[nextIndex].value;
    onChange(next);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div className="flex items-center gap-1.5">
      {CategoryIcon && (
        <Hint label={ariaLabel} side={tooltipSide}>
          <CategoryIcon size={11} className="shrink-0 text-editorial-muted" aria-hidden="true" />
        </Hint>
      )}
      <div role="radiogroup" aria-label={ariaLabel} aria-disabled={disabled || undefined} className="flex gap-1">
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <Tooltip key={option.value} label={option.label} side={tooltipSide}>
              <button
                ref={(element) => { buttonRefs.current[option.value] = element; }}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={option.label}
                tabIndex={option.value === tabbableValue ? 0 : -1}
                disabled={disabled || option.disabled}
                onClick={() => onChange(option.value)}
                onKeyDown={(event) => handleKeyDown(option.value, event)}
                className={`${DOT_CLASSNAME} ${chosen ? DOT_CHOSEN_CLASSNAME : DOT_IDLE_CLASSNAME}`}
              >
                {option.content}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
