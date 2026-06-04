import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

/**
 * Builds the translation memory block to append at the end of stage-instructions.
 * Returns null if the match list is empty.
 *
 * IMPORTANT: append ONLY to stage-instructions — never touch static or blob blocks
 * to preserve prefix caching.
 */
export function buildMemoryInjection(matches: PhraseMemoryMatch[]): string | null {
  if (matches.length === 0) return null;
  const lines = matches.map((m) => `- ${JSON.stringify(m.sourcePhrase)} → ${JSON.stringify(m.targetPhrase)}`);
  return [
    'Translation memory references (use for terminology consistency only, do not copy verbatim):',
    ...lines,
  ].join('\n');
}
