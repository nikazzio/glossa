import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../hooks/useDebounce';
import { recognizeWork } from '../../services/iiifProviderService';
import type { IIIFProvider, IIIFRecognition } from '../../types';
import { errorMessage, logger } from '../../utils/logger';
import { IconButton, Spinner } from '../ui';

/** Il tempo di finire di scrivere: riconoscere a ogni tasto è lavoro buttato. */
const RECOGNITION_DELAY_MS = 300;

/**
 * Le opere che le biblioteche riconoscono in quello che si sta scrivendo.
 * La risposta vale solo per il testo a cui risponde: finché l'attesa non è
 * passata, per un testo appena cambiato non c'è niente da proporre.
 */
export function useRecognitions(input: string): IIIFRecognition[] {
  const text = input.trim();
  const settled = useDebounce(text, RECOGNITION_DELAY_MS);
  const [answer, setAnswer] = useState<{ text: string; found: IIIFRecognition[] }>({ text: '', found: [] });
  useEffect(() => {
    if (!settled) { setAnswer({ text: '', found: [] }); return; }
    let disposed = false;
    recognizeWork(settled)
      .then((found) => { if (!disposed) setAnswer({ text: settled, found }); })
      .catch((error: unknown) => {
        logger.warn('federation.recognition.failed', { error: errorMessage(error) });
        if (!disposed) setAnswer({ text: settled, found: [] });
      });
    return () => { disposed = true; };
  }, [settled]);
  return answer.text === text ? answer.found : [];
}

/**
 * Sopra i risultati, una riga per ogni biblioteca che riconosce quello che è
 * stato scritto come un'opera precisa. Chi cerca per parole non deve fare
 * niente in più: la riga compare solo quando c'è qualcosa da aprire.
 */
export function RecognizedWorks({ recognitions, providers, opening, onOpen }: {
  recognitions: IIIFRecognition[];
  providers: IIIFProvider[];
  opening: string | null;
  onOpen: (providerKey: string) => void;
}) {
  const { t } = useTranslation();
  if (recognitions.length === 0) return null;
  return (
    <ul className="shrink-0 divide-y divide-editorial-border/60 border-b border-editorial-border">
      {recognitions.map((recognition) => {
        const label = providers.find((provider) => provider.key === recognition.providerKey)?.label
          ?? recognition.providerKey;
        return (
          <li key={recognition.providerKey} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-editorial-ink">
              {t('federation.openDirectly', { library: label })}
              <span className="ml-2 font-mono text-xs text-editorial-muted">{recognition.docId}</span>
            </span>
            <IconButton size="sm" title={t('federation.openDirectlyAction', { library: label })}
              disabled={opening !== null} onClick={() => onOpen(recognition.providerKey)}>
              {opening === recognition.providerKey ? <Spinner size={14} /> : <ArrowRight size={14} />}
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}
