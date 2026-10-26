import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { StackedColumns } from './StackedColumns';

it('exposes each series and its tooltip when a column receives keyboard focus', async () => {
  render(<StackedColumns data={[{ key: 'oct', label: 'October', values: { translation: 2, ocr: 1 } }]}
    series={[{ key: 'translation', label: 'Translation', className: 'bg-chart-translations' }, { key: 'ocr', label: 'OCR', className: 'bg-chart-transcriptions' }]}
    format={(value) => `$${value}`} ariaLabel="Spend" />);
  const column = screen.getByRole('button', { name: 'October: $3; Translation: $2; OCR: $1' });
  await userEvent.tab();
  expect(column).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Translation $2');
  expect(screen.getByRole('tooltip')).toHaveTextContent('OCR $1');
});
