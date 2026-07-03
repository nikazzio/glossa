/**
 * react-resizable-panels inietta `*, *:hover {cursor: X !important}` in
 * document.adoptedStyleSheets mentre un Separator è in stato active/hover, e la
 * rimuove solo al pointerup/pointerleave gestito dai listener del suo Group.
 * Se il Group si smonta mentre il separator era in hover/drag (cambio vista),
 * quei listener spariscono prima che la regola venga ripulita e il cursore
 * sbagliato resta bloccato su tutta l'app. Chiamare questa funzione nel
 * cleanup di ogni componente che monta un Group.
 */
export function resetStrayResizeCursor() {
  const sheets = document.adoptedStyleSheets;
  if (!sheets || typeof sheets.length !== 'number') return;
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const rule = sheet.cssRules[0];
    if (rule instanceof CSSStyleRule && rule.selectorText === '*, *:hover') {
      sheet.deleteRule(0);
    }
  }
}
