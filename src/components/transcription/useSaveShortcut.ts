import { useEffect, useRef } from 'react';

/** Ctrl/⌘+S chiama `onSave`; vale anche mentre si scrive nel foglio: è lì che serve. */
export function useSaveShortcut(onSave: () => void): void {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      onSaveRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
