import { NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Menu } from '../ui';

interface AnnotationContextMenuProps {
  x: number;
  y: number;
  onAddAnnotation: () => void;
  onClose: () => void;
}

export function AnnotationContextMenu({ x, y, onAddAnnotation, onClose }: AnnotationContextMenuProps) {
  const { t } = useTranslation();

  return (
    <Menu
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      anchorRect={{ x, y }}
      items={[
        {
          id: 'add-annotation',
          label: t('annotations.contextMenuAdd'),
          icon: <NotebookPen size={13} />,
          onSelect: onAddAnnotation,
        },
      ]}
    />
  );
}
