import { useEffect, useRef, useState } from 'react';
import { probeManifest } from '../services/iiifProviderService';
import { errorMessage, logger } from '../utils/logger';

/** Quante righe si controllano insieme. Poche: è un lavoro che nessuno sta
 *  aspettando, e deve restare dietro a tutto il resto. */
const AT_ONCE = 2;

/** Le verifiche già fatte in questa sessione, per indirizzo del manifesto: una
 *  riga che esce e rientra dallo schermo non si ricontrolla. */
const known = new Map<string, boolean | null>();

let running = 0;
const waiting: (() => void)[] = [];

/** Un posto in coda: chi arriva quando i posti sono pieni aspetta il suo turno
 *  invece di partire comunque. */
async function takeTurn(): Promise<() => void> {
  if (running >= AT_ONCE) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  return () => {
    running -= 1;
    waiting.shift()?.();
  };
}

/**
 * Se un risultato si apre davvero, chiesto solo quando la riga si guarda.
 *
 * Un catalogo elenca anche materiale che non ha una riproduzione: la scheda
 * c'è, il libro digitalizzato no. Controllarle tutte sarebbe una raffica di
 * richieste per informazioni che nessuno ha chiesto, e controllarle mai
 * significa scoprirlo aprendo una riga per volta.
 *
 * Qui si controlla **solo quando `visible` è vero**, due righe alla volta,
 * senza ritentare: quello che si sa resta per tutta la sessione.
 */
export function useOpenableProbe(
  providerKey: string,
  manifestUrl: string,
  declared: boolean | null | undefined,
  visible: boolean,
): { openable: boolean | null; checking: boolean } {
  const [openable, setOpenable] = useState<boolean | null>(
    declared ?? known.get(manifestUrl) ?? null,
  );
  const [checking, setChecking] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    // Il motore lo ha già letto aprendo il manifesto per completare la scheda:
    // chiederlo di nuovo sarebbe una richiesta per una risposta che abbiamo.
    if (declared !== undefined && declared !== null) {
      setOpenable(declared);
      return;
    }
    if (!visible || asked.current) return;
    if (known.has(manifestUrl)) {
      setOpenable(known.get(manifestUrl) ?? null);
      return;
    }
    asked.current = true;
    let cancelled = false;
    setChecking(true);
    void (async () => {
      const release = await takeTurn();
      try {
        const outcome = await probeManifest(providerKey, manifestUrl);
        known.set(manifestUrl, outcome);
        if (!cancelled) setOpenable(outcome);
      } catch (error: unknown) {
        // Un controllo che non riesce non dice niente sull'opera: la riga resta
        // com'era, senza un avviso che sarebbe solo rumore.
        logger.debug('discovery probe failed', { manifestUrl, message: errorMessage(error) });
      } finally {
        release();
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerKey, manifestUrl, declared, visible]);

  return { openable, checking };
}
