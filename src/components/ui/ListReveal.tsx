import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_EDITORIAL, LIST_STAGGER, LIST_STAGGER_MAX, MOTION_DURATION } from '../layout/motion';

/**
 * Una riga che compare in un elenco, appena dopo quella sopra.
 *
 * Serve a far leggere l'elenco come una cosa che si compone, non come un
 * blocco che appare: il ritardo è brevissimo e si ferma dopo le prime righe,
 * perché un elenco lungo non deve farsi aspettare. La cascata vale per la
 * prima comparsa: dopo, chi usa l'elenco non deve riaspettarlo a ogni filtro. Chi ha chiesto meno
 * animazioni al sistema operativo vede le righe ferme al loro posto.
 */
export function ListReveal({ index, children, stagger = true }: {
  index: number;
  children: ReactNode;
  /** Falso quando l'elenco è già sullo schermo: le righe che entrano dopo un
   *  filtro compaiono tutte insieme, senza farsi aspettare una dopo l'altra. */
  stagger?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: MOTION_DURATION,
        ease: EASE_EDITORIAL,
        delay: stagger ? Math.min(index, LIST_STAGGER_MAX) * LIST_STAGGER : 0,
      }}
    >
      {children}
    </motion.div>
  );
}
