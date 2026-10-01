import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDebounce } from '../../hooks/useDebounce';
import type { PageStatus } from '../viewer/PageViewer';
import {
  ensureSegment,
  getSegmentByPosition,
  listRevisions,
  saveSegmentText,
  type TranscriptionRevision,
  type TranscriptionSegment,
} from '../../services/transcriptionService';

const SAVE_DELAY_MS = 30_000;

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export interface SegmentEditor {
  segment: TranscriptionSegment | null;
  setSegment: Dispatch<SetStateAction<TranscriptionSegment | null>>;
  revisions: TranscriptionRevision[];
  setRevisions: Dispatch<SetStateAction<TranscriptionRevision[]>>;
  loadingSegment: boolean;
  draft: string;
  saveState: SaveState;
  pageIndex: number;
  pageLabel: string | null;
  pageTotal: number | null;
  pendingStatus: PageStatus | null;
  setPendingStatus: Dispatch<SetStateAction<PageStatus | null>>;
  /** Testo scritto nel foglio: diventa la bozza da salvare. */
  changeDraft: (text: string) => void;
  /** Un testo arrivato dal database (es. una revisione ripristinata): bozza e
   *  ultimo salvato coincidono, niente da salvare. */
  replaceSavedText: (text: string) => void;
  save: (text: string) => Promise<void>;
  loadSegmentForPage: (preserveDirty?: boolean) => Promise<void>;
  goToViewerPage: (index: number, label: string | null, total: number | null) => void;
  goToTextPage: (nextIndex: number) => void;
  draftRef: MutableRefObject<string>;
  savedRef: MutableRefObject<string>;
  pageIndexRef: MutableRefObject<number>;
}

/**
 * Il testo di una pagina: segmento, storico, bozza e la catena di salvataggio.
 *
 * **Un segmento per pagina**, non uno per documento: cambiare pagina cambia il
 * testo mostrato, ancorato a quella posizione (`transcription_segments.position`).
 * Un documento senza visore resta su un solo blocco di testo, in posizione 0.
 */
export function useSegmentEditor(documentId: string): SegmentEditor {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<TranscriptionSegment | null>(null);
  const [revisions, setRevisions] = useState<TranscriptionRevision[]>([]);
  const [loadingSegment, setLoadingSegment] = useState(true);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');

  // La pagina mostrata a sinistra: un documento senza visore resta sempre a
  // 0, l'unico blocco di testo che ha senso per lui.
  const [pageIndex, setPageIndex] = useState(0);
  const [pageLabel, setPageLabel] = useState<string | null>(null);
  const [pageTotal, setPageTotal] = useState<number | null>(null);
  /** La pagina richiesta è in corso o è appena fallita: stesso segnale che
   *  la scheda opera in Biblioteca usa già, qui applicato al testo e allo
   *  storico invece che ai dati tecnici della copia. */
  const [pendingStatus, setPendingStatus] = useState<PageStatus | null>(null);

  const debouncedDraft = useDebounce(draft, SAVE_DELAY_MS);
  const savedRef = useRef('');
  const draftRef = useRef(draft);
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    draftRef.current = draft;
    saveStateRef.current = saveState;
  }, [draft, saveState]);
  const attemptRef = useRef<string | null>(null);
  // Un salvataggio in corso quando si cambia pagina non deve scrivere il suo
  // risultato sullo stato della pagina nuova, arrivato nel frattempo.
  const pageIndexRef = useRef(pageIndex);
  useEffect(() => { pageIndexRef.current = pageIndex; }, [pageIndex]);
  const loadedPageRef = useRef<number | null>(null);
  const loadRequestRef = useRef(0);
  // Il cambio pagina (salvataggio immediato) e il debounce possono chiedere
  // di salvare quasi nello stesso istante: senza serializzare, entrambi
  // leggono la stessa revisione precedente e calcolano lo stesso numero
  // successivo, e uno dei due testi sparisce in silenzio (scartato dal
  // vincolo di unicità). Incodare sulla stessa catena li rende sequenziali.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const loadSegmentForPage = useCallback(async (preserveDirty = false) => {
    const requestedPage = pageIndex;
    const request = ++loadRequestRef.current;
    setLoadingSegment(true);
    try {
      // Tornando subito a una pagina lasciata con testo da salvare, leggi
      // solo dopo che la sua scrittura in coda è terminata.
      await saveChainRef.current;
      if (request !== loadRequestRef.current || pageIndexRef.current !== requestedPage) return;
      const existing = await getSegmentByPosition(documentId, requestedPage);
      const history = existing ? await listRevisions(existing.id) : [];
      if (request !== loadRequestRef.current || pageIndexRef.current !== requestedPage) return;
      if (preserveDirty && (draftRef.current !== savedRef.current || saveStateRef.current !== 'saved')) return;
      setSegment(existing);
      setRevisions(history);
      const currentText = history[0]?.text ?? '';
      draftRef.current = currentText;
      setDraft(currentText);
      savedRef.current = currentText;
      loadedPageRef.current = requestedPage;
      attemptRef.current = null;
      setSaveState('saved');
    } catch (err: unknown) {
      if (request === loadRequestRef.current) toast.error(t('transcription.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (request === loadRequestRef.current) setLoadingSegment(false);
    }
  }, [documentId, pageIndex, t]);

  useEffect(() => { void loadSegmentForPage(); }, [loadSegmentForPage]);

  const save = useCallback(
    (text: string) => {
      const savingPage = pageIndex;
      const savingSegment = loadedPageRef.current === savingPage ? segment : null;
      const savingLabel = pageLabel;
      // Incodato: parte solo a salvataggio precedente concluso, così legge
      // sempre l'ultima revisione davvero scritta e non ne collide il numero.
      const run = saveChainRef.current.then(async () => {
        if (pageIndexRef.current === savingPage) {
          attemptRef.current = text;
          setSaveState('saving');
        }
        try {
          // Sfogliare pagine mai trascritte non crea righe vuote: il segmento
          // nasce solo al primo salvataggio davvero.
          const target = savingSegment ?? await ensureSegment(documentId, savingPage, savingLabel);
          if (pageIndexRef.current === savingPage && loadedPageRef.current === savingPage && !savingSegment) setSegment(target);
          const revision = await saveSegmentText(target.id, text, 'user');
          if (pageIndexRef.current !== savingPage || loadedPageRef.current !== savingPage) return;
          if (revision) {
            // Il testo davvero persistito, non quello tentato: su collisione
            // la revisione restituita è quella dell'altro salvataggio, non la nostra.
            savedRef.current = revision.text;
            if (attemptRef.current === text) {
              setSaveState(revision.text !== text ? 'error' : draftRef.current === text ? 'saved' : 'pending');
            }
            setRevisions((current) => [revision, ...current.filter((r) => r.id !== revision.id)]);
          } else if (attemptRef.current === text) {
            savedRef.current = text;
            setSaveState(draftRef.current === text ? 'saved' : 'pending');
          }
        } catch (error: unknown) {
          if (pageIndexRef.current === savingPage && attemptRef.current === text) {
            setSaveState('error');
          } else {
            toast.error(t('transcription.saveError'), {
              description: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
      saveChainRef.current = run;
      return run;
    },
    [segment, documentId, pageIndex, pageLabel, t],
  );
  const saveOnExitRef = useRef(save);
  saveOnExitRef.current = save;
  useEffect(() => () => {
    if (loadedPageRef.current === pageIndexRef.current && draftRef.current !== savedRef.current) {
      void saveOnExitRef.current(draftRef.current);
    }
  }, []);

  useEffect(() => {
    if (loadingSegment || loadedPageRef.current !== pageIndex || debouncedDraft !== draftRef.current) return;
    if (debouncedDraft === savedRef.current) return;
    if (attemptRef.current === debouncedDraft) return;
    void save(debouncedDraft);
  }, [debouncedDraft, save, loadingSegment, pageIndex]);

  /** Il visore ha disegnato un'altra pagina davvero (non solo richiesta): se
   *  quella che si lascia ha testo non ancora salvato, lo si salva subito —
   *  aspettare il debounce lo perderebbe cambiando pagina in fretta. Chi
   *  chiama decide se il visore comanda il testo (in sincronia) o no. */
  const goToViewerPage = useCallback(
    (index: number, label: string | null, total: number | null) => {
      if (index === pageIndex) { setPageLabel(label); setPageTotal(total); setPendingStatus(null); return; }
      if (loadedPageRef.current === pageIndex && draftRef.current !== savedRef.current) void save(draftRef.current);
      pageIndexRef.current = index;
      loadedPageRef.current = null;
      ++loadRequestRef.current;
      setLoadingSegment(true);
      setPageIndex(index);
      setPageLabel(label);
      setPageTotal(total);
      setPendingStatus(null);
    },
    [save, pageIndex],
  );

  /** Le frecce indipendenti del testo, fuori sincronia: stessa cautela di
   *  `goToViewerPage` per non perdere testo non salvato. La pagina
   *  raggiunta così non ha un'etichetta nota (non viene da un visore), va
   *  azzerata perché non resti quella della pagina lasciata. */
  const goToTextPage = (nextIndex: number) => {
    if (nextIndex === pageIndex) return;
    if (loadedPageRef.current === pageIndex && draftRef.current !== savedRef.current) void save(draftRef.current);
    pageIndexRef.current = nextIndex;
    loadedPageRef.current = null;
    ++loadRequestRef.current;
    setLoadingSegment(true);
    setPageIndex(nextIndex);
    setPageLabel(null);
  };

  const changeDraft = (text: string) => {
    draftRef.current = text;
    setDraft(text);
    setSaveState('pending');
  };

  const replaceSavedText = (text: string) => {
    draftRef.current = text;
    setDraft(text);
    savedRef.current = text;
  };

  return {
    segment,
    setSegment,
    revisions,
    setRevisions,
    loadingSegment,
    draft,
    saveState,
    pageIndex,
    pageLabel,
    pageTotal,
    pendingStatus,
    setPendingStatus,
    changeDraft,
    replaceSavedText,
    save,
    loadSegmentForPage,
    goToViewerPage,
    goToTextPage,
    draftRef,
    savedRef,
    pageIndexRef,
  };
}
