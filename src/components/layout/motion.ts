/**
 * Token di motion condivisi della shell multibar.
 * Centralizzano spring/curve/durate per evitare magic number duplicati tra le superfici.
 */

/** Curva editoriale (ease-out morbido) per gli ingressi delle barre. */
export const EASE_EDITORIAL: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Transizione flex dei pannelli react-resizable-panels nella shell progetto. */
export const PANEL_FLEX_TRANSITION_CLASS =
  'transition-[flex] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';
