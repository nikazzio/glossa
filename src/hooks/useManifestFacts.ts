import { useEffect, useState } from 'react';
import { inspectManifest, type ManifestFacts } from '../services/iiifProviderService';
import { logger } from '../utils/logger';

/**
 * Cosa la biblioteca dichiara di un'opera: se si apre, quante pagine, che
 * misura ha la prima, se esiste un PDF.
 *
 * Tre regole, e sono tutta la robustezza di questo file:
 *
 * 1. **una richiesta per opera**, condivisa da chiunque la stia aspettando e
 *    ricordata per il resto della sessione;
 * 2. **due alla volta**, non di più: un elenco di venti risultati non deve
 *    diventare venti richieste insieme verso la stessa biblioteca;
 * 3. **ogni richiesta finisce**, comunque vada. Una che non finisse terrebbe
 *    occupato il suo posto e, dietro, tutte le altre: è esattamente come la
 *    Biblioteca si bloccava.
 */

/** Oltre questo tempo la risposta non arriverà: il motore ha già le sue
 *  scadenze, questa è la rete di sicurezza di chi le sta aspettando. */
const ANSWER_DEADLINE_MS = 35_000;

/** Quante letture insieme. Il ritmo verso la biblioteca lo impone il motore;
 *  questo tetto serve a non accodargliene venti in una volta. */
const AT_ONCE = 2;

/** Quello che si sa di un'opera che non si è potuta verificare. */
export const UNVERIFIED: ManifestFacts = {
  openable: null,
  pages: null,
  samplePixels: null,
  document: null,
  renderings: [],
};

const known = new Map<string, ManifestFacts>();
const pending = new Map<string, { users: number; promise: Promise<ManifestFacts> }>();
let running = 0;
const waiting: Array<() => void> = [];

async function takeTurn(): Promise<() => void> {
  if (running < AT_ONCE) running += 1;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  let released = false;
  return () => {
    // Rilasciare due volte lo stesso posto ne regalerebbe uno che non esiste.
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  };
}

/** La lettura vera, con la scadenza che ne garantisce la fine. */
async function ask(providerKey: string, manifestUrl: string): Promise<ManifestFacts> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ManifestFacts>((resolve) => {
    timer = setTimeout(() => {
      logger.debug('discovery.inspect.timedOut', { providerKey });
      resolve(UNVERIFIED);
    }, ANSWER_DEADLINE_MS);
  });
  try {
    return await Promise.race([inspectManifest(providerKey, manifestUrl), deadline]);
  } catch (error: unknown) {
    // Un guasto di rete riguarda adesso, non l'opera: non si ricorda, così la
    // riga resta verificabile invece di restare «non verificata» per sempre.
    logger.debug('discovery.inspect.failed', {
      providerKey,
      reason: error instanceof Error ? error.message : String(error),
    });
    return UNVERIFIED;
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(providerKey: string, manifestUrl: string): string {
  return JSON.stringify([providerKey, manifestUrl]);
}

/**
 * La lettura condivisa: chi la chiede mentre è in corso aspetta la stessa, e
 * chi la richiede dopo trova la risposta già pronta.
 *
 * Solo una risposta **verificata** si ricorda: un guasto o una scadenza non
 * devono marchiare un'opera per tutta la sessione.
 */
export async function readManifestFacts(
  providerKey: string,
  manifestUrl: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<ManifestFacts> {
  const key = cacheKey(providerKey, manifestUrl);
  if (!fresh) {
    const remembered = known.get(key);
    if (remembered) return remembered;
    const inFlight = pending.get(key);
    if (inFlight) {
      inFlight.users += 1;
      return inFlight.promise;
    }
  }

  const task = { users: 1, promise: Promise.resolve(UNVERIFIED) };
  task.promise = (async () => {
    const release = await takeTurn();
    try {
      // Chi si era iscritto può essersene andato mentre aspettavamo il turno:
      // se non guarda più nessuno, la richiesta non parte nemmeno.
      if (task.users === 0) return UNVERIFIED;
      const facts = await ask(providerKey, manifestUrl);
      if (facts.openable !== null) known.set(key, facts);
      return facts;
    } finally {
      release();
      if (pending.get(key) === task) pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task.promise;
}

/**
 * Gli stessi fatti per una riga di elenco: si chiedono quando la riga entra
 * nello schermo, e mai per un'opera che il catalogo dichiara già senza
 * riproduzione — lì non c'è nessun manifesto da leggere.
 */
export function useManifestFacts(
  providerKey: string,
  manifestUrl: string,
  declaredOpenable: boolean | null | undefined,
  visible: boolean,
): { facts: ManifestFacts; checking: boolean } {
  const key = cacheKey(providerKey, manifestUrl);
  const [state, setState] = useState<{ key: string; facts: ManifestFacts; checking: boolean }>({
    key,
    facts: known.get(key) ?? UNVERIFIED,
    checking: false,
  });

  useEffect(() => {
    if (declaredOpenable === false || !visible || !manifestUrl) {
      setState({ key, facts: known.get(key) ?? UNVERIFIED, checking: false });
      return;
    }
    const remembered = known.get(key);
    if (remembered) {
      setState({ key, facts: remembered, checking: false });
      return;
    }
    let cancelled = false;
    setState({ key, facts: UNVERIFIED, checking: true });
    const task = pending.get(key);
    void readManifestFacts(providerKey, manifestUrl).then((facts) => {
      if (!cancelled) setState({ key, facts, checking: false });
    });
    return () => {
      cancelled = true;
      if (task) task.users -= 1;
    };
  }, [key, providerKey, manifestUrl, declaredOpenable, visible]);

  const current = state.key === key ? state : { facts: known.get(key) ?? UNVERIFIED, checking: false };
  return {
    // Quello che il catalogo ha già dichiarato resta, anche quando il manifesto
    // non si è potuto leggere.
    facts:
      declaredOpenable == null
        ? current.facts
        : { ...current.facts, openable: current.facts.openable ?? declaredOpenable },
    checking: current.checking,
  };
}
