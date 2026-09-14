import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_EDITORIAL, LIST_STAGGER, LIST_STAGGER_MAX, MOTION_DURATION } from '../layout/motion';

/**
 * Una riga che compare in un elenco, appena dopo quella sopra.
 *
 * Serve a far leggere l'elenco come una cosa che si compone, non come un
 * blocco che appare: il ritardo è brevissimo e si ferma dopo le prime righe,
 * perché un elenco lungo non deve farsi aspettare. Chi ha chiesto meno
 * animazioni al sistema operativo vede le righe ferme al loro posto.
 */
export function ListReveal({ index, children }: { index: number; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: MOTION_DURATION,
        ease: EASE_EDITORIAL,
        delay: Math.min(index, LIST_STAGGER_MAX) * LIST_STAGGER,
      }}
    >
      {children}
    </motion.div>
  );
}
