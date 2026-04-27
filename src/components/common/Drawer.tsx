import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DrawerProps {
  open: boolean;
  side: 'left' | 'right';
  onClose: () => void;
  ariaLabelledBy: string;
  ariaDescribedBy?: string;
  maxWidth?: string;
  children: ReactNode;
}

export function Drawer({
  open,
  side,
  onClose,
  ariaLabelledBy,
  ariaDescribedBy,
  maxWidth = 'max-w-[520px]',
  children,
}: DrawerProps) {
  const trapRef = useFocusTrap(open, onClose);
  const xOffscreen = side === 'left' ? '-100%' : '100%';
  const positionClass = side === 'left' ? 'mr-auto' : 'ml-auto';
  const borderClass = side === 'left' ? 'border-r' : 'border-l';

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[55] flex"
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-editorial-ink/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: xOffscreen }}
            animate={{ x: 0 }}
            exit={{ x: xOffscreen }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`relative ${positionClass} flex h-full w-full ${maxWidth} flex-col bg-editorial-bg ${borderClass} border-editorial-border shadow-2xl`}
          >
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
