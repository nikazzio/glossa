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
      { key: 'gallica', label: 'Gallica', placeholder: 'e.g. btv1b84260335', is_enabled: true, resolver: 'gallica', search_handler: 'gallica', search_mode: 'search_first', supports_search: true, supports_direct_resolution: true, aliases: ['bnf'], filters: [{ key: 'material_type', options: [] }] },
      { key: 'generic', label: 'Direct IIIF URL', placeholder: 'e.g. https://example.org/manifest.json', is_enabled: true, resolver: 'generic', search_handler: null, search_mode: 'direct', supports_search: false, supports_direct_resolution: true, aliases: [], filters: [] },
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
