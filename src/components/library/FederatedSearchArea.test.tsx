import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FederatedSearchArea } from './FederatedSearchArea';
import { useFederatedSearchStore } from '../../stores/federatedSearchStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useUiStore } from '../../stores/uiStore';
import { EMPTY_SEARCH, type SearchRun } from '../../services/federatedSearchService';
import type { Job } from '../../services/jobsService';
import type { IIIFProvider } from '../../types';

const mocks = vi.hoisted(() => ({ createSearch: vi.fn(), listProviders: vi.fn(), recognize: vi.fn(), selected: null as unknown }));

vi.mock('../../services/federatedSearchService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/federatedSearchService')>()),
  createSearch: mocks.createSearch,
}));
vi.mock('../../services/iiifProviderService', () => ({
  listIIIFProviders: mocks.listProviders,
  openWork: vi.fn(),
  recognizeWork: mocks.recognize,
}));
vi.mock('../../hooks/useFederatedSearch', () => ({
  useFederatedSearch: () => ({ runs: [], selected: mocks.selected, pages: [], error: null, loading: false, refresh: vi.fn(), hasMore: false, loadMore: vi.fn() }),
}));

function provider(key: string, supportsSearch = true): IIIFProvider {
  return {
    key, label: key.toUpperCase(), aliases: [], placeholder: '', isEnabled: true, resolver: key,
    searchHandler: supportsSearch ? key : null, supportsDirectResolution: true, supportsSearch, kind: 'library',
    availability: supportsSearch ? 'searchable' : 'directOnly', siteSearch: '', searchFields: [],
  };
}

describe('FederatedSearchArea — words arriving from Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selected = null;
    mocks.listProviders.mockResolvedValue([provider('gallica'), provider('mdz'), provider('heidelberg', false)]);
    mocks.recognize.mockResolvedValue([]);
    mocks.createSearch.mockResolvedValue({ id: 'run-1' });
    useFederatedSearchStore.setState({ providers: ['gallica'] });
    useSourceLibraryStore.setState({ loadLibraryManifestUrls: vi.fn().mockResolvedValue(undefined) });
    useUiStore.setState({ location: { area: 'search', query: 'Dante' } });
  });

  it('launches the words on every searchable library and replaces them with the new search', async () => {
    render(<FederatedSearchArea query="Dante" />);

    await waitFor(() => expect(mocks.createSearch).toHaveBeenCalledTimes(1));
    expect(mocks.createSearch).toHaveBeenCalledWith(expect.objectContaining({
      providers: ['gallica', 'mdz'],
      criteria: expect.objectContaining({ query: 'Dante' }),
    }));
    await waitFor(() => expect(useUiStore.getState().location).toEqual({ area: 'search', searchId: 'run-1' }));
  });

  it('does not launch the search again when the page comes back without the words', async () => {
    const { rerender } = render(<FederatedSearchArea query="Dante" />);
    await waitFor(() => expect(mocks.createSearch).toHaveBeenCalledTimes(1));

    rerender(<FederatedSearchArea searchId="run-1" />);
    rerender(<FederatedSearchArea searchId="run-1" />);

    expect(mocks.createSearch).toHaveBeenCalledTimes(1);
  });

  it('keeps an address in the box for recognition instead of searching', async () => {
    const address = 'https://gallica.bnf.fr/ark:/12148/btv1b1';
    useUiStore.setState({ location: { area: 'search', query: address } });
    render(<FederatedSearchArea query={address} />);

    await waitFor(() => expect(useUiStore.getState().location).toEqual({ area: 'search' }));
    expect(screen.getByDisplayValue(address)).toBeInTheDocument();
    expect(mocks.createSearch).not.toHaveBeenCalled();
  });
});

describe('FederatedSearchArea — sources that did not answer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProviders.mockResolvedValue([provider('gallica'), provider('mdz')]);
    mocks.recognize.mockResolvedValue([]);
    useSourceLibraryStore.setState({ loadLibraryManifestUrls: vi.fn().mockResolvedValue(undefined) });
    const run: SearchRun = {
      id: 'run-1', criteria: { ...EMPTY_SEARCH, query: 'Dante' }, providers: ['gallica', 'mdz'], groupId: 'g',
      derivedFromId: null, createdAt: '2026-11-21', archived: false,
      executions: [
        { providerKey: 'gallica', generation: 1, resultSetId: 'a', page: 1, mode: 'search', hasMore: false, received: 0,
          job: { id: 'j1', status: 'error', error: 'provider_unavailable' } as Job },
        { providerKey: 'mdz', generation: 1, resultSetId: 'b', page: 1, mode: 'search', hasMore: false, received: 2,
          job: { id: 'j2', status: 'completed', error: null } as Job },
      ],
    };
    mocks.selected = run;
  });

  it('opens the execution panel from the warning', async () => {
    render(<FederatedSearchArea searchId="run-1" />);
    fireEvent.click(screen.getByRole('tab', { name: /federation\.history/ }));
    expect(screen.queryByRole('button', { name: 'federation.retry' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'federation.showSources' })[0]);

    expect(await screen.findByRole('button', { name: 'federation.retry' })).toBeInTheDocument();
  });

  it('points to the Sources tab instead of a row of site links when nothing is found', async () => {
    render(<FederatedSearchArea searchId="run-1" />);
    expect(screen.getByText('federation.tryProviderSites')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: /federation\.history/ }));
    const openSources = screen.getAllByRole('button', { name: 'federation.showSources' });
    expect(openSources).toHaveLength(2);
    fireEvent.click(openSources[1]);

    expect(await screen.findByRole('button', { name: 'federation.retry' })).toBeInTheDocument();
  });
});
