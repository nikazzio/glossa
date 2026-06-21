import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AlertDialog } from './AlertDialog';

function setup(props: Partial<React.ComponentProps<typeof AlertDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AlertDialog
      open
      onOpenChange={onOpenChange}
      title="Eliminare il workspace?"
      description="Operazione irreversibile."
      confirmLabel="Elimina"
      cancelLabel="Annulla"
      onConfirm={onConfirm}
      tone="danger"
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('AlertDialog', () => {
  it('mostra titolo, descrizione e pulsanti', () => {
    setup();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Eliminare il workspace?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeInTheDocument();
  });

  it('invoca onConfirm al click su conferma', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disabilita i pulsanti quando busy', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeDisabled();
  });
});
