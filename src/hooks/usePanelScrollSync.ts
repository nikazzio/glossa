import { useEffect, useRef } from 'react';

function getScrollTarget(container: HTMLElement): HTMLElement | null {
  if (container.scrollHeight > container.clientHeight) return container;
  return container.querySelector<HTMLElement>('textarea, [data-scroll], .custom-scrollbar') ?? null;
}

function scrollRatio(el: HTMLElement): number {
  const range = el.scrollHeight - el.clientHeight;
  return range > 0 ? el.scrollTop / range : 0;
}

export function usePanelScrollSync(enabled: boolean): {
  sourceRef: React.RefObject<HTMLDivElement | null>;
  translationRef: React.RefObject<HTMLDivElement | null>;
} {
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const translationRef = useRef<HTMLDivElement | null>(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const sourceCtr = sourceRef.current;
    const translationCtr = translationRef.current;
    if (!sourceCtr || !translationCtr) return;

    const syncFrom = (fromCtr: HTMLElement, toCtr: HTMLElement) => (e: Event) => {
      if (isSyncing.current) return;
      const from = e.target as HTMLElement;
      if (from.scrollHeight <= from.clientHeight) return;
      const to = getScrollTarget(toCtr);
      if (!to) return;
      isSyncing.current = true;
      const ratio = scrollRatio(from);
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
      requestAnimationFrame(() => { isSyncing.current = false; });
    };

    const onSourceScroll = syncFrom(sourceCtr, translationCtr);
    const onTranslationScroll = syncFrom(translationCtr, sourceCtr);

    sourceCtr.addEventListener('scroll', onSourceScroll, { capture: true, passive: true });
    translationCtr.addEventListener('scroll', onTranslationScroll, { capture: true, passive: true });

    return () => {
      sourceCtr.removeEventListener('scroll', onSourceScroll, { capture: true });
      translationCtr.removeEventListener('scroll', onTranslationScroll, { capture: true });
    };
  }, [enabled]);

  return { sourceRef, translationRef };
}
