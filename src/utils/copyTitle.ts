import type { TFunction } from 'i18next';
import type { LibrarySourceVersion } from '../types';

/**
 * Come si chiama una copia digitale a schermo.
 *
 * Mai l'etichetta salvata nel database: lì c'è un marcatore tecnico
 * («primary») che non significa niente per chi legge e che infatti compariva
 * al posto del nome della biblioteca. Si dice chi l'ha digitalizzata; se non è
 * noto, che tipo di copia è.
 */
export function copyTitle(
  version: Pick<LibrarySourceVersion, 'versionKind'>,
  providerLabel: string | undefined,
  t: TFunction,
): string {
  return (
    providerLabel ??
    t(`areas.library.versionKindLabels.${version.versionKind}`, {
      defaultValue: t('areas.library.versionKindLabels.other'),
    })
  );
}
