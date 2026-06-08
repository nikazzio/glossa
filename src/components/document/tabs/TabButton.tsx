import { type KeyboardEvent } from 'react';
import { IconButton } from '../../ui';

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
}

export function TabButton({ buttonId, active, disabled, onClick, onKeyDown, label, icon, controls, buttonRef }: TabButtonProps) {
  return (
    <IconButton
      id={buttonId}
      ref={buttonRef}
      size="lg"
      tone={active ? 'accent' : 'default'}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      aria-disabled={disabled}
      disabled={disabled}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={label}
      ariaLabel={label}
      tooltipSide="bottom"
    >
      {icon}
    </IconButton>
  );
}
