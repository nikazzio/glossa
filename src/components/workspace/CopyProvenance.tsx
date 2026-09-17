import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../ui';

/**
 * Chi ha digitalizzato questa copia.
 *
 * Il nome viene dal registro delle biblioteche, e da nient'altro: l'etichetta
 * salvata nel database è un marcatore tecnico e non si mostra mai. Quando la
 * biblioteca non è nota non si inventa un nome né si ripiega sul tipo di copia
 * — si dichiara che il record è incompleto, così si vede e si può rifare.
 */
export function CopyProvenance({ providerLabel, className = '' }: {
  providerLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  if (providerLabel) {
    return <span className={className}>{providerLabel}</span>;
  }

  return (
    <Tooltip label={t('areas.library.provenanceMissing')} side="bottom">
      <span
        className={`flex items-center text-editorial-warning ${className}`.trim()}
        role="img"
        aria-label={t('areas.library.provenanceMissing')}
      >
        <AlertTriangle size={13} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
