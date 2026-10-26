import type { ReactNode } from 'react';

/** Le aree con un inchiostro proprio. */
export type InkedArea = 'library' | 'transcriptions' | 'translations';

/** L'inchiostro di ogni area, per testo e icone. Classi intere: Tailwind non
 *  vede quelle composte a pezzi. */
export const AREA_INK_CLASSNAME: Record<InkedArea, string> = {
  library: 'text-area-library',
  transcriptions: 'text-area-transcriptions',
  translations: 'text-area-translations',
};

/** La carta di ogni area: lo sfondo dell'elenco, appena diverso da un'area all'altra. */
export const AREA_PAPER_CLASSNAME: Record<InkedArea, string> = {
  library: 'bg-area-library-paper',
  transcriptions: 'bg-area-transcriptions-paper',
  translations: 'bg-area-translations-paper',
};

const AREA_RULE_CLASSNAME: Record<InkedArea, string> = {
  library: 'bg-area-library',
  transcriptions: 'bg-area-transcriptions',
  translations: 'bg-area-translations',
};

/**
 * Il titolo grande di un'area con il suo filetto nell'inchiostro dell'area:
 * dice dove si è senza colorare i comandi, che restano neutri. `children` sono
 * i comandi propri dell'elenco, in fondo alla riga e allineati alla base.
 */
export function AreaHeading({ area, title, children }: { area: InkedArea; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{title}</h1>
        <span className={`mt-2 block h-0.5 w-12 rounded-full ${AREA_RULE_CLASSNAME[area]}`} aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}
