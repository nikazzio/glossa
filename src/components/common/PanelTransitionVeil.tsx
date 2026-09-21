import { motion } from 'motion/react';

/**
 * Copre un contenuto che sta per cambiare del tutto (nuovo `panelKey`, quindi
 * smontaggio e rimontaggio) con un velo dello stesso colore dello sfondo, che
 * sparisce svanendo. Senza, lo smontaggio mostra per un istante il vuoto sotto
 * — uno scatto, non una transizione — prima che il contenuto nuovo arrivi.
 */
export function PanelTransitionVeil({
  panelKey,
  tone,
  variant = 'workspace',
}: {
  panelKey: string;
  tone: 'paper' | 'bg' | 'panel';
  variant?: 'workspace' | 'project';
}) {
  const transition =
    variant === 'project'
      ? { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }
      : { duration: 0.44, ease: [0.19, 1, 0.22, 1] as const };
  const initialOpacity = variant === 'project' ? 0.78 : 0.92;
  const toneClass =
    tone === 'paper' ? 'bg-editorial-paper' : tone === 'panel' ? 'bg-surface-panel' : 'bg-editorial-bg';

  return (
    <motion.div
      key={panelKey}
      initial={{ opacity: initialOpacity }}
      animate={{ opacity: 0 }}
      transition={transition}
      className={`pointer-events-none absolute inset-0 z-20 ${toneClass}`}
    />
  );
}
