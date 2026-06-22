import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '../../stores/confirmStore';
import { AlertDialog } from '../ui';

export function ConfirmDialog() {
  const { open, request, resolve } = useConfirmStore();
  const { t } = useTranslation();

  if (!request) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resolve(false);
      }}
      title={request.title}
      description={request.message}
      confirmLabel={request.confirmLabel ?? t('common.confirm')}
      cancelLabel={request.cancelLabel ?? t('common.cancel')}
      onConfirm={() => resolve(true)}
      tone={request.danger ? 'danger' : 'default'}
    />
  );
}
