import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryCatalogArea } from './LibraryCatalogArea';
import '../../test/i18n-mock';

const mockListIIIFProviders = vi.fn();
vi.mock('../../services/iiifProviderService', () => ({
  listIIIFProviders: () => mockListIIIFProviders(),
}));

describe('LibraryCatalogArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListIIIFProviders.mockResolvedValue([
      { key: 'gallica', label: 'Gallica', placeholder: 'e.g. btv1b84260335', isEnabled: true, resolver: 'gallica', searchHandler: 'gallica', searchMode: 'search_first', supportsSearch: true, supportsDirectResolution: true, aliases: ['bnf'], filters: [{ key: 'material_type', options: [] }] },
      { key: 'generic', label: 'Direct IIIF URL', placeholder: 'e.g. https://example.org/manifest.json', isEnabled: true, resolver: 'generic', searchHandler: null, searchMode: 'direct', supportsSearch: false, supportsDirectResolution: true, aliases: [], filters: [] },
    ]);
  });

  it('shows registry providers and their declared capabilities', async () => {
    render(<LibraryCatalogArea />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Gallica' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Direct IIIF URL' })).toBeInTheDocument();
    expect(screen.getByText('areas.library.capabilities.search_first')).toBeInTheDocument();
    expect(screen.getByText('areas.library.capabilities.direct')).toBeInTheDocument();
  });

  it('shows an understandable empty state when the registry cannot load', async () => {
    mockListIIIFProviders.mockRejectedValueOnce(new Error('offline'));
    render(<LibraryCatalogArea />);

    await waitFor(() => {
      expect(screen.getByText('areas.library.registryError')).toBeInTheDocument();
    });
  });
});
