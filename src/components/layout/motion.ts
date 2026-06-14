import type { Transition } from 'motion/react';

/**
 * Token di motion condivisi della shell multibar.
 * Centralizzano spring/curve/durate per evitare magic number duplicati tra le superfici.
 */

/** Curva editoriale (ease-out morbido) per gli ingressi delle barre. */
export const EASE_EDITORIAL: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Spring dei pannelli fly-out (ProjectFlyout, ConfigDrawer): apertura/chiusura larghezza. */
export const SPRING_PANEL: Transition = { type: 'spring', damping: 30, stiffness: 280 };

/** Transizione larghezza Tailwind condivisa dalle barre primarie (rail, dashboard). */
export const WIDTH_TRANSITION_CLASS = 'transition-[width] duration-200';
