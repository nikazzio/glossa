import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

function EditableFixture() {
  const [value, setValue] = useState('Ciao');
  return (
    <MarkdownEditor
      value={value}
      onChange={setValue}
      identityKey="chunk-1:candidate:final"
    />
  );
}

describe('MarkdownEditor', () => {
  it('gestisce Ctrl+Z su textarea controlled', async () => {
    render(<EditableFixture />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Ciao mondo' } });
    expect(textarea).toHaveValue('Ciao mondo');

    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true });

    await waitFor(() => {
      expect(textarea).toHaveValue('Ciao');
    });
  });

  it('non renderizza una textarea per contenuti readonly senza highlight', () => {
    render(
      <MarkdownEditor
        value="Output stage readonly"
        onChange={() => {}}
        readOnly
        identityKey="chunk-1:stage:translation"
      />,
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Output stage readonly')).toBeInTheDocument();
  });
});
