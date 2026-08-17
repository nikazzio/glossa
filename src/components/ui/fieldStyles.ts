/**
 * Il trattamento dei campi nativi (input, textarea) dentro le finestre.
 *
 * Il fondo è `editorial-textbox` perché è il **ruolo di controllo**: alcuni
 * campi usavano `editorial-bg`, che è lo stesso colore della finestra, e si
 * riconoscevano solo dal bordo — nella stessa schermata «scrivi qui» aveva due
 * aspetti diversi. Raggio piccolo: nelle finestre i contenitori arrotondati
 * grandi non si usano.
 */
export const FIELD_CLASSNAME =
  'w-full rounded-md border border-editorial-border bg-editorial-textbox px-3 py-2 text-sm text-editorial-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';

/** Lo stesso campo per valori numerici o tecnici, che si leggono meglio a spaziatura fissa. */
export const FIELD_MONO_CLASSNAME = `${FIELD_CLASSNAME} font-mono`;
