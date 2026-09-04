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

/**
 * Campo per un numero breve: largo quanto le cifre che ci stanno e allineato a
 * destra, così le cifre di righe diverse si incolonnano. Un campo largo per un
 * «2» faceva sembrare mancante il resto del valore.
 */
export const FIELD_NUMBER_CLASSNAME =
  'w-16 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 text-right text-sm font-mono text-editorial-ink outline-none transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Campo di testo che sta accanto alla sua etichetta e non si allarga: la
 * variante piena (`FIELD_CLASSNAME`) dentro una riga di impostazioni si prende
 * tutto e schiaccia l'etichetta.
 */
export const FIELD_INLINE_CLASSNAME =
  'rounded-md border border-editorial-border bg-editorial-textbox px-3 py-1.5 text-sm text-editorial-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40';
