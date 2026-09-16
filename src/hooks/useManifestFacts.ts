import { useEffect, useState } from 'react';
import { inspectManifest, type ManifestFacts } from '../services/iiifProviderService';
import { logger } from '../utils/logger';

const AT_ONCE = 2;
const known = new Map<string, ManifestFacts>();
const pending = new Map<string, { users: number; promise: Promise<ManifestFacts | null> }>();

const UNKNOWN: ManifestFacts = {
  openable: null,
  pages: null,
  samplePixels: null,
  document: null,
  renderings: [],
};
let running = 0;
const waiting: Array<() => void> = [];

async function takeTurn(): Promise<() => void> {
  if (running < AT_ONCE) running += 1;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  return () => {
    const next = waiting.shift();
    if (next) next(); // Transfer the occupied slot; do not briefly expose a third one.
    else running -= 1;
  };
}

/**
 * Gli stessi fatti, chiesti una volta sola, per chi non è una riga di elenco.
 *
 * Li usa chi aggiunge un'opera alla Biblioteca e chi chiede alla biblioteca se
 * il documento esiste: la risposta letta per la riga scorsa un momento prima
 * vale ancora, e ripeterla sarebbe bussare due volte per la stessa domanda.
 * Con `fresh` si ripassa dalla biblioteca: serve quando si sta chiedendo
 * apposta «guarda di nuovo».
 */
export async function readManifestFacts(
  providerKey: string,
  manifestUrl: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<ManifestFacts> {
  const key = JSON.stringify([providerKey, manifestUrl]);
  const remembered = known.get(key);
  if (!fresh && remembered) return remembered;
  const facts = await inspectManifest(providerKey, manifestUrl);
  known.set(key, facts);
  return facts;
}

/**
 * Cosa la biblioteca offre di quest'opera: si apre, quante pagine, che misura
 * ha la prima, se esiste un documento unico.
 *
 * Una richiesta per biblioteca e manifesto per sessione, condivisa da tutte le
 * righe che la aspettano; il lavoro in coda per righe che nessuno guarda più
 * viene buttato prima di toccare la rete.
 */
export function useManifestFacts(
  providerKey: string,
  manifestUrl: string,
  declaredOpenable: boolean | null | undefined,
  visible: boolean,
): { facts: ManifestFacts; checking: boolean } {
  const key = JSON.stringify([providerKey, manifestUrl]);
  const [state, setState] = useState<{ key: string; facts: ManifestFacts; checking: boolean }>({
    key,
    facts: UNKNOWN,
    checking: false,
  });

  useEffect(() => {
    // Un'opera che il catalogo dichiara senza riproduzione non ha un manifesto
    // da leggere: chiederlo sarebbe una richiesta sicura di fallire.
    if (declaredOpenable === false || !visible || !manifestUrl || known.has(key)) {
      setState({ key, facts: known.get(key) ?? UNKNOWN, checking: false });
      return;
    }
    let cancelled = false;
    let task = pending.get(key);
    if (!task) {
      const created = { users: 0, promise: Promise.resolve<ManifestFacts | null>(null) };
      created.promise = (async () => {
        const release = await takeTurn();
        try {
          // Chi si è iscritto mentre aspettavamo il turno vuole comunque la
          // risposta: si rinuncia solo se davvero non guarda più nessuno.
          if (created.users === 0) {
            pending.delete(key);
            return null;
          }
          const outcome = await inspectManifest(providerKey, manifestUrl);
          known.set(key, outcome);
          return outcome;
        } catch {
          // Un guasto di rete riguarda adesso, non l'opera: se lo ricordassimo
          // la riga non verrebbe più letta per tutta la sessione.
          logger.debug('discovery.inspect.failed', { providerKey, code: 'inspect_failed' });
          return null;
        } finally {
          release();
          pending.delete(key);
        }
      })();
      task = created;
      pending.set(key, task);
    }
    task.users += 1;
    setState({ key, facts: UNKNOWN, checking: true });
    void task.promise.then((facts) => {
      if (!cancelled) setState({ key, facts: facts ?? UNKNOWN, checking: false });
    });
    return () => {
      cancelled = true;
      task.users -= 1;
    };
  }, [key, providerKey, manifestUrl, declaredOpenable, visible]);

  const current = state.key === key ? state : { facts: known.get(key) ?? UNKNOWN, checking: false };
  return {
    // Una scheda che si è già aperta non torna «ignota» perché il manifesto non
    // è stato riletto: quello che il catalogo ha già dichiarato resta.
    facts:
      declaredOpenable == null
        ? current.facts
        : { ...current.facts, openable: current.facts.openable ?? declaredOpenable },
    checking: current.checking,
  };
}
