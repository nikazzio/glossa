import { useState, type ReactNode } from 'react';
import { CatalogSearchField } from './CatalogSearchField';
import { ClickPopover } from './ClickPopover';
import { IconButton } from './IconButton';
import { PopoverItem } from './PopoverItem';

export interface SearchPickerItem {
  id: string;
  label: string;
  /** Second line, monospaced: the code. */
  detail: string;
}

export interface SearchPickerGroup {
  id: string;
  label: string;
  items: SearchPickerItem[];
}

interface SearchPickerProps {
  icon: ReactNode;
  title: string;
  disabled?: boolean;
  searchLabel: string;
  /** Groups for the current query; empty groups are not shown. */
  search: (query: string) => SearchPickerGroup[];
  /** Shown under the results when the query is empty (the full list appears only by typing). */
  emptyQueryHint?: string;
  noResults: string;
  onPick: (id: string) => void;
}

/** An icon command opening a searchable list grouped under small captions: one pick closes it. */
export function SearchPicker({ icon, title, disabled = false, searchLabel, search, emptyQueryHint, noResults, onPick }: SearchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const groups = open ? search(query).filter((group) => group.items.length > 0) : [];
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };
  const pick = (id: string) => {
    changeOpen(false);
    onPick(id);
  };

  return (
    <ClickPopover
      open={open}
      onOpenChange={changeOpen}
      align="end"
      className="w-80"
      trigger={<IconButton size="sm" title={title} ariaPressed={open} disabled={disabled}>{icon}</IconButton>}
    >
      <div className="border-b border-rule p-2">
        <CatalogSearchField value={query} onChange={setQuery} placeholder={searchLabel} label={searchLabel} focusOnMount
          onKeyDown={(event) => { if (event.key === 'Escape') changeOpen(false); }} />
      </div>
      <div className="max-h-72 overflow-y-auto p-1 custom-scrollbar">
        {groups.length === 0 && <p className="px-3 py-3 text-center text-xs text-editorial-muted">{noResults}</p>}
        {groups.map((group) => (
          <section key={group.id} aria-label={group.label}>
            <h3 className="px-3 pb-1 pt-2 text-caption font-bold uppercase tracking-section text-editorial-muted">{group.label}</h3>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={item.id} className="flex">
                  <PopoverItem label={item.label} description={item.detail} onSelect={() => pick(item.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!query.trim() && emptyQueryHint && <p className="px-3 pb-2 pt-3 text-xs italic text-editorial-muted">{emptyQueryHint}</p>}
      </div>
    </ClickPopover>
  );
}
