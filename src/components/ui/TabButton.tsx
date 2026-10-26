import { type KeyboardEvent } from 'react';
import { IconButton, type IconButtonTone } from './IconButton';

export interface TabButtonProps {
  buttonId: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  label: string;
  icon: React.ReactNode;
  controls: string;
  buttonRef: (element: HTMLButtonElement | null) => void;
  activeTone?: IconButtonTone;
}

export function TabButton({ buttonId, active, disabled, onClick, onKeyDown, label, icon, controls, buttonRef, activeTone = 'accent' }: TabButtonProps) {
  return (
    <IconButton
      id={buttonId}
      ref={buttonRef}
      size="lg"
      tone={active ? activeTone : 'default'}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      aria-disabled={disabled}
      className={disabled ? 'cursor-not-allowed opacity-40' : undefined}
      tabIndex={active || disabled ? 0 : -1}
      onClick={() => { if (!disabled) onClick(); }}
      onKeyDown={onKeyDown}
      title={label}
      ariaLabel={label}
      tooltipSide="bottom"
    >
      {icon}
    </IconButton>
  );
}
