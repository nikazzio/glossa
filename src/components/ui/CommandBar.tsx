import { Fragment, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClickPopover } from './ClickPopover';
import { IconButton } from './IconButton';
import { MenuActionRow } from './MenuActionRow';
import { COMMAND_DIVIDER_CLASSNAME } from './catalogStyles';

export interface RowCommand {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}

interface CommandBarProps {
  /** Gruppi di comandi, nell'ordine della fila; un filetto li divide. */
  groups: RowCommand[][];
  /**
   * `inline` mette i comandi in fila come icone, per la riga a elenco; `menu`
   * li raccoglie in un menu, dove lo spazio è poco (copertine, tabella).
   */
  variant?: 'inline' | 'menu';
  size?: 'sm' | 'md';
  /** Primo gruppo della fila, già fatto da chi chiama (`inline`). */
  leading?: ReactNode;
  /** Uno stato che resta acceso davanti ai comandi (un lavoro in corso). */
  status?: ReactNode;
}

/**
 * I comandi di una riga di catalogo, uguali in ogni elenco: icone neutre con
 * la descrizione al passaggio, in gruppi divisi da un filetto, oppure lo
 * stesso elenco in un menu.
 */
export function CommandBar({ groups, variant = 'inline', size = 'sm', leading, status }: CommandBarProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const filled = groups.filter((group) => group.length > 0);

  if (variant === 'inline') {
    const rendered = [
      ...(leading ? [leading] : []),
      ...filled.map((group) => group.map((command) => <CommandButton key={command.key} command={command} size={size} />)),
    ];
    return (
      <div className="flex shrink-0 items-center gap-1">
        {status}
        {rendered.map((group, index) => (
          <Fragment key={index}>
            {index > 0 && <span className={`mx-1 ${COMMAND_DIVIDER_CLASSNAME}`} aria-hidden="true" />}
            {group}
          </Fragment>
        ))}
      </div>
    );
  }

  const menuRow = (command: RowCommand) => (
    <MenuActionRow
      key={command.key}
      icon={command.icon}
      label={command.label}
      onClick={() => {
        setMenuOpen(false);
        command.onClick();
      }}
      disabled={command.disabled}
      tone={command.tone}
    />
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      {status}
      <ClickPopover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <IconButton size={size} title={t('areas.library.moreActions')} ariaPressed={menuOpen}>
            <MoreVertical size={size === 'sm' ? 13 : 15} />
          </IconButton>
        }
      >
        <div className="min-w-44 py-1">
          {filled.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <div className="my-1 border-t border-rule" />}
              {group.map(menuRow)}
            </Fragment>
          ))}
        </div>
      </ClickPopover>
    </div>
  );
}

/** Neutro anche per eliminare: la conferma arriva dopo, e una fila di icone
 *  con una rossa in fondo attirerebbe l'occhio sul comando più raro. */
function CommandButton({ command, size }: { command: RowCommand; size: 'sm' | 'md' }) {
  return (
    <IconButton
      size={size === 'sm' ? 'xs' : 'sm'}
      title={command.label}
      onClick={command.onClick}
      disabled={command.disabled}
    >
      {command.icon}
    </IconButton>
  );
}
