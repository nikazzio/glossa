import type { PromptTemplate } from '../../types';

/** Da dove viene il testo di un prompt, per dirlo nel titolo senza aprire la modifica. */
export type PromptSource =
  | { kind: 'empty' }
  | { kind: 'default' }
  | { kind: 'template'; name: string }
  | { kind: 'custom' };

/**
 * Riconosce il testo confrontandolo con il predefinito e con i template della
 * stessa categoria. Il confronto è sul testo, non su un collegamento: un
 * template modificato dopo l'applicazione non è più riconosciuto, ed è giusto,
 * perché la pipeline conserva la copia applicata.
 */
export function describePromptSource(value: string, templates: PromptTemplate[], defaultValue?: string): PromptSource {
  const text = value.trim();
  if (!text) return { kind: 'empty' };
  if (defaultValue !== undefined && defaultValue.trim() === text) return { kind: 'default' };
  const template = templates.find((entry) => entry.prompt.trim() === text);
  return template ? { kind: 'template', name: template.name } : { kind: 'custom' };
}
