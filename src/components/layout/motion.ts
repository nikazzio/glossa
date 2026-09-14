/**
 * Token di motion condivisi della shell multibar.
 * Centralizzano spring/curve/durate per evitare magic number duplicati tra le superfici.
 */

/** Curva editoriale (ease-out morbido) per gli ingressi delle barre. */
export const EASE_EDITORIAL: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Transizione flex dei pannelli react-resizable-panels nella shell progetto. */
export const PANEL_FLEX_TRANSITION_CLASS =
  'transition-[flex] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

/**
 * Movimenti sobri condivisi: cambio area, comparsa delle righe di un elenco,
 * apertura di un riquadro. Si notano solo se li si cerca — sono schermate di
 * lavoro, che si attraversano cento volte al giorno, e un movimento lungo
 * diventa un'attesa.
 */
export const MOTION_DURATION = 0.18;

/** Di quanti pixel entra un contenuto: uno spostamento, non un volo. */
export const MOTION_SHIFT = 6;

/** Ritardo fra una riga e la successiva in un elenco che compare. */
export const LIST_STAGGER = 0.03;

/**
 * Oltre questa riga il ritardo non cresce più: con cinquanta righe l'ultima
 * arriverebbe un secondo e mezzo dopo la prima, cioè in ritardo.
 */
export const LIST_STAGGER_MAX = 8;
