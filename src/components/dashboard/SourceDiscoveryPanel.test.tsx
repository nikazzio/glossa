import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../test/i18n-mock';
import { SourceDiscoveryPanel } from './SourceDiscoveryPanel';
import { useUiStore } from '../../stores/uiStore';

const mockListProviders = vi.fn();
const mockDiscover = vi.fn();

vi.mock('../../services/iiifProviderService', () => ({
  listIIIFProviders: () => mockListProviders(),
  discoverIIIF: (...args: unknown[]) => mockDiscover(...args),
}));

const PROVIDERS = [
  { key: 'archive_org', label: 'Internet Archive', aliases: [], placeholder: 'Search', isEnabled: true, resolver: 'archive_org', searchHandler: 'archive_org', searchMode: 'search_first', supportsDirectResolution: true, supportsSearch: true, filters: [] },
];

describe('SourceDiscoveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ discoveryResultsPerRow: 3 });
    mockListProviders.mockResolvedValue(PROVIDERS);
  });

  it('shows a distinct error when discovery fails', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('dashboard.discovery.searchFailed');
    expect(screen.queryByText('dashboard.discovery.notFound')).not.toBeInTheDocument();
  });

  it('uses a native button to expand one result at a time', async () => {
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: false,
      results: [
        { id: 'one', title: 'First source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], manifestUrl: 'https://example.test/one' },
        { id: 'two', title: 'Second source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], manifestUrl: 'https://example.test/two' },
      ],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    const first = await screen.findByRole('button', { name: /First source/ });
    const second = screen.getByRole('button', { name: /Second source/ });

    await user.click(first);
    await waitFor(() => expect(first).toHaveAttribute('aria-expanded', 'true'));
    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });
});
