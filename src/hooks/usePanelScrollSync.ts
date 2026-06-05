import { useEffect, useRef } from 'react';

const SCROLL_TARGET_SELECTOR = '[data-scroll-sync="true"], [data-scroll], textarea, .custom-scrollbar';
const PROGRAMMATIC_SCROLL_IGNORE_MS = 180;

function isScrollable(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 1;
}

function getScrollTarget(container: HTMLElement): HTMLElement | null {
  if (isScrollable(container)) return container;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(SCROLL_TARGET_SELECTOR));
  return candidates.find(isScrollable) ?? candidates[0] ?? null;
}

function getEventScrollTarget(eventTarget: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  if (!(eventTarget instanceof HTMLElement) || !boundary.contains(eventTarget)) {
    return getScrollTarget(boundary);
  }
  return isScrollable(eventTarget) ? eventTarget : getScrollTarget(boundary);
}

function scrollRatio(el: HTMLElement): number {
  const range = el.scrollHeight - el.clientHeight;
  return range > 0 ? el.scrollTop / range : 0;
}

function applyScrollRatio(from: HTMLElement, to: HTMLElement) {
  const targetRange = to.scrollHeight - to.clientHeight;
  if (targetRange <= 0) return;
  const nextTop = scrollRatio(from) * targetRange;
  if (Math.abs(to.scrollTop - nextTop) < 1) return;
  to.scrollTop = nextTop;
}

export function usePanelScrollSync(enabled: boolean): {
  sourceRef: React.RefObject<HTMLDivElement | null>;
  translationRef: React.RefObject<HTMLDivElement | null>;
} {
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const translationRef = useRef<HTMLDivElement | null>(null);
  const isSyncing = useRef(false);
  const ignoredTargetRef = useRef<{ el: HTMLElement; until: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const sourceCtr = sourceRef.current;
    const translationCtr = translationRef.current;
    if (!sourceCtr || !translationCtr) return;

    const syncFrom = (toCtr: HTMLElement, fromCtr: HTMLElement) => (e: Event) => {
      if (isSyncing.current) return;
      const from = getEventScrollTarget(e.target, fromCtr);
      if (!from || !isScrollable(from)) return;
      const ignored = ignoredTargetRef.current;
      if (ignored && ignored.el === from && performance.now() < ignored.until) return;
      const to = getScrollTarget(toCtr);
      if (!to) return;
      isSyncing.current = true;
      ignoredTargetRef.current = {
        el: to,
        until: performance.now() + PROGRAMMATIC_SCROLL_IGNORE_MS,
      };
      applyScrollRatio(from, to);
      window.setTimeout(() => {
        isSyncing.current = false;
      }, 0);
    };

    const onSourceScroll = syncFrom(translationCtr, sourceCtr);
    const onTranslationScroll = syncFrom(sourceCtr, translationCtr);

    sourceCtr.addEventListener('scroll', onSourceScroll, { capture: true, passive: true });
    translationCtr.addEventListener('scroll', onTranslationScroll, { capture: true, passive: true });

    return () => {
      sourceCtr.removeEventListener('scroll', onSourceScroll, { capture: true });
      translationCtr.removeEventListener('scroll', onTranslationScroll, { capture: true });
      ignoredTargetRef.current = null;
    };
  }, [enabled]);

  return { sourceRef, translationRef };
}
