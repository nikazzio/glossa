import { createContext, useContext, type ReactNode } from 'react';

/**
 * La maniglia di trascinamento di una sezione della Panoramica.
 *
 * Nasce dov'è il trascinamento (il contenitore ordinabile) ma va mostrata
 * dentro l'intestazione della sezione, che non sa niente di trascinamenti: il
 * contesto porta il comando già pronto fin lì, senza far passare una catena di
 * proprietà attraverso ogni riquadro.
 */
const SectionDragHandleContext = createContext<ReactNode>(null);

export function SectionDragHandleProvider({ handle, children }: { handle: ReactNode; children: ReactNode }) {
  return <SectionDragHandleContext.Provider value={handle}>{children}</SectionDragHandleContext.Provider>;
}

/** La maniglia da mostrare, oppure niente dove la sezione non si sposta. */
export function useSectionDragHandle(): ReactNode {
  return useContext(SectionDragHandleContext);
}
