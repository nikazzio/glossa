import type { ReactNode } from 'react';

export function SidebarSectionShell({ children }: { children: ReactNode }) {
  return <div className="px-1">{children}</div>;
}
