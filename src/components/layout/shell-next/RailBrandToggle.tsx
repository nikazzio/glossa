import { PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import glossaAppIcon from '../../../assets/glossa-app-icon.png';
import { IconButton } from '../../ui';

interface RailBrandToggleProps {
  onExpand: () => void;
  title: string;
  /** Nel contesto progetto mostra il segno del workspace; nella Dashboard resta Glossa. */
  icon?: ReactNode;
}

/** Brand mark keeps the collapsed rail quiet; its expand affordance appears on hover. */
export function RailBrandToggle({ onExpand, title, icon }: RailBrandToggleProps) {
  return (
    <IconButton
      size="md"
      tone="default"
      onClick={onExpand}
      title={title}
      tooltipSide="right"
      className="group relative h-9 w-9 overflow-hidden border-transparent bg-transparent hover:border-editorial-accent/40 hover:bg-editorial-textbox/45"
    >
      {icon ? (
        <span className="inline-flex h-8 w-8 items-center justify-center text-editorial-accent transition-all duration-150 group-hover:scale-75 group-hover:opacity-0 group-focus-visible:scale-75 group-focus-visible:opacity-0">
          {icon}
        </span>
      ) : (
        <img
          src={glossaAppIcon}
          alt=""
          aria-hidden="true"
          className="h-7 w-7 transition-all duration-150 group-hover:scale-75 group-hover:opacity-0 group-focus-visible:scale-75 group-focus-visible:opacity-0"
        />
      )}
      <PanelLeftOpen
        size={15}
        aria-hidden="true"
        className="absolute opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </IconButton>
  );
}
