import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryCatalogArea } from './LibraryCatalogArea';
import '../../test/i18n-mock';

describe('LibraryCatalogArea', () => {
  it('shows the personal library without discovery controls', () => {
    render(<LibraryCatalogArea />);

    expect(screen.getByRole('heading', { name: 'areas.library.title' })).toBeInTheDocument();
    expect(screen.getByText('areas.library.emptyMessage')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
