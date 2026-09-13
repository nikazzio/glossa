import { useEffect, useState } from 'react';
import { probeManifest } from '../services/iiifProviderService';
import { logger } from '../utils/logger';

const AT_ONCE = 2;
const known = new Map<string, boolean | null>();
const pending = new Map<string, { users: number; promise: Promise<boolean | null> }>();
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

/** One request per provider/manifest per session, shared by mounted consumers.
 *  Queued work with no interested rows is discarded before any network request. */
export function useOpenableProbe(providerKey: string, manifestUrl: string,
  declared: boolean | null | undefined, visible: boolean,
): { openable: boolean | null; checking: boolean } {
  const key = JSON.stringify([providerKey,manifestUrl]);
  const [state,setState] = useState<{key:string;openable:boolean|null;checking:boolean}>({key,openable:null,checking:false});
  useEffect(() => {
    if (declared != null || !visible || !manifestUrl || known.has(key)) {
      setState({key,openable:declared ?? known.get(key) ?? null,checking:false});
      return;
    }
    let cancelled = false;
    let task = pending.get(key);
    if (!task) {
      const created = {users:0,promise:Promise.resolve<boolean|null>(null)};
      created.promise = (async () => {
        const release = await takeTurn();
        try {
          // Chi si è iscritto mentre aspettavamo il turno vuole comunque la
          // risposta: si rinuncia solo se davvero non guarda più nessuno.
          if (created.users === 0) { pending.delete(key); return null; }
          const outcome = await probeManifest(providerKey,manifestUrl);
          known.set(key,outcome);
          return outcome;
        } catch {
          // Un guasto di rete riguarda adesso, non l'opera: se lo ricordassimo
          // la riga non verrebbe più controllata per tutta la sessione.
          logger.debug('discovery.probe.failed',{providerKey,code:'probe_failed'});
          return null;
        } finally {
          release();
          pending.delete(key);
        }
      })();
      task = created;
      pending.set(key,task);
    }
    task.users += 1;
    setState({key,openable:null,checking:true});
    void task.promise.then((openable) => { if (!cancelled) setState({key,openable,checking:false}); });
    return () => { cancelled=true; task.users -= 1; };
  }, [key,providerKey,manifestUrl,declared,visible]);
  return state.key === key ? {openable:declared ?? state.openable,checking:declared == null && state.checking}
    : {openable:declared ?? known.get(key) ?? null,checking:false};
}
