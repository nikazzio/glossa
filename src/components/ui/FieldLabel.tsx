import type { ReactNode } from 'react';

interface FieldLabelProps {
  children: ReactNode;
  icon?: ReactNode;
  htmlFor?: string;
  /** Va a riga sopra il campo invece di stare in linea accanto (es. affiancato a un input). */
  block?: boolean;
}

const TEXT_CLASSNAME = 'text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-editorial-muted';

export function FieldLabel({ children, icon, htmlFor, block }: FieldLabelProps) {
  const className = block ? `block ${TEXT_CLASSNAME}` : TEXT_CLASSNAME;
  const text = htmlFor
    ? <label htmlFor={htmlFor} className={className}>{children}</label>
    : <span className={className}>{children}</span>;

  if (!icon) return text;

  return (
    <div className="flex items-center gap-1.5">
      {icon}
      {text}
    </div>
  );
}
