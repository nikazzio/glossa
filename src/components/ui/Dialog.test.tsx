import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Dialog } from './Dialog';

function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        onOpenChange?.(o);
      }}
      title="Esporta documento"
      closeLabel="Chiudi"
    >
      <button type="button">azione interna</button>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('rende il dialog con il titolo collegato', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Esporta documento')).toBeInTheDocument();
  });

  it('chiude con Escape e notifica onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('chiude dal pulsante di chiusura', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
