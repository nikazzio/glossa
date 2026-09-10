import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { TabButton } from './TabButton';

export interface TabStripItem {
  id: string;
  label: string;
  icon: ReactNode;
}

/**
 * Una fila di linguette icona con la loro navigazione da tastiera.
 *
 * Esisteva tre volte a mano — finestra impostazioni, provider, pannello
 * dell'opera — e ogni copia era un'occasione di divergere sul tasto Home o sul
 * percorso di tabulazione. Qui il focus segue la linguetta scelta, come vuole
 * il modello ARIA: fuori dalla fila si entra e si esce con un solo Tab.
 */
export function TabStrip({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  idPrefix,
  className = '',
}: {
  tabs: TabStripItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Radice degli identificativi: `<prefix>-tab-<id>` e `<prefix>-panel-<id>`. */
  idPrefix: string;
  className?: string;
}) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const go = (id: string) => {
    onChange(id);
    buttons.current[id]?.focus();
  };

  const handleKeyDown = (id: string, event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    const last = tabs.length - 1;
    let next: string | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = tabs[(index - 1 + tabs.length) % tabs.length].id;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length].id;
    else if (event.key === 'Home') next = tabs[0].id;
    else if (event.key === 'End') next = tabs[last].id;
    if (next === null) return;
    event.preventDefault();
    go(next);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex items-center gap-1 ${className}`}>
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          buttonId={`${idPrefix}-tab-${tab.id}`}
          active={tab.id === activeId}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(tab.id, event)}
          label={tab.label}
          icon={tab.icon}
          controls={`${idPrefix}-panel-${tab.id}`}
          buttonRef={(element) => {
            buttons.current[tab.id] = element;
          }}
        />
      ))}
    </div>
  );
}
