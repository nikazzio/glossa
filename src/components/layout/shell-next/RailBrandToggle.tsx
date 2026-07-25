import { PanelLeftOpen } from 'lucide-react';
import glossaAppIcon from '../../../assets/glossa-app-icon.png';
import { IconButton } from '../../ui';

interface RailBrandToggleProps {
  onExpand: () => void;
  title: string;
}

/** Brand mark keeps the collapsed rail quiet; its expand affordance appears on hover. */
export function RailBrandToggle({ onExpand, title }: RailBrandToggleProps) {
  return (
    <IconButton
      size="md"
      tone="default"
      onClick={onExpand}
      title={title}
      tooltipSide="right"
      className="group relative h-9 w-9 overflow-hidden border-transparent bg-transparent hover:border-editorial-accent/40 hover:bg-editorial-textbox/45"
    >
      <img
        src={glossaAppIcon}
        alt=""
        aria-hidden="true"
        className="h-7 w-7 transition-all duration-150 group-hover:scale-75 group-hover:opacity-0"
      />
      <PanelLeftOpen
        size={15}
        aria-hidden="true"
        className="absolute opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
    </IconButton>
  );
}
