import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Menu } from './Menu';

describe('Menu', () => {
  it('espone role=menu e invoca onSelect della voce', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <Menu
        open
        onOpenChange={() => {}}
        anchorRect={{ x: 10, y: 10 }}
        items={[{ id: 'note', label: 'Aggiungi nota', onSelect }]}
      />,
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Aggiungi nota' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
