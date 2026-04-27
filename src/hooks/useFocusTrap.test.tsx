import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function TrapFixture() {
  const [value, setValue] = useState('');
  const trapRef = useFocusTrap(true, () => {});

  return (
    <div ref={trapRef}>
      <button type="button">Close</button>
      <input
        aria-label="Secret key"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}

describe('useFocusTrap', () => {
  it('keeps focus inside the trap across rerenders', async () => {
    const user = userEvent.setup();
    render(<TrapFixture />);

    const input = screen.getByLabelText('Secret key');
    await user.click(input);
    await user.type(input, 'a');

    expect(input).toHaveFocus();
  });
});
