import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchExecutionPanel } from './SearchExecutionPanel';
import { EMPTY_SEARCH, type SearchExecution, type SearchRun } from '../../services/federatedSearchService';
import type { Job } from '../../services/jobsService';
import type { IIIFProvider } from '../../types';

function provider(key: string, siteSearch: string): IIIFProvider {
  return {
    key, label: key.toUpperCase(), aliases: [], placeholder: '', isEnabled: true, resolver: key,
    searchHandler: key, supportsDirectResolution: true, supportsSearch: true, kind: 'library',
    availability: 'searchable', siteSearch, searchFields: [],
  };
}

function execution(providerKey: string, status: Job['status'], received: number): SearchExecution {
  return {
    providerKey, generation: 1, resultSetId: providerKey, page: 1, mode: 'search', hasMore: false, received,
    job: { id: `job-${providerKey}`, status, error: status === 'error' ? 'provider_unavailable' : null } as Job,
  };
}

const RUN: SearchRun = {
  id: 'run-1', criteria: { ...EMPTY_SEARCH, query: 'Divina commedia' }, providers: ['gallica', 'mdz', 'ecodices'],
  groupId: 'g', derivedFromId: null, createdAt: '2026-11-21', archived: false,
  executions: [execution('gallica', 'error', 0), execution('mdz', 'completed', 12), execution('ecodices', 'completed', 3)],
};

const PROVIDERS = [
  provider('gallica', 'https://gallica.bnf.fr/services/engine/search/sru?query={query}'),
  provider('mdz', 'https://www.digitale-sammlungen.de/search?query={query}'),
  provider('ecodices', ''),
];

function row(label: string) {
  const item = screen.getByText(label).closest('li');
  if (!item) throw new Error(`row ${label} not found`);
  return within(item);
}

describe('SearchExecutionPanel — site link', () => {
  it('offers the library site with the searched words on every row that has a site address', () => {
    render(<SearchExecutionPanel run={RUN} providers={PROVIDERS} busy={false} providerFilter="all"
      onProviderFilter={vi.fn()} act={vi.fn()} />);

    const failed = row('GALLICA');
    expect(failed.getByRole('button', { name: 'federation.retry' })).toBeInTheDocument();
    expect(failed.getByRole('link', { name: 'federation.openProviderSite' }))
      .toHaveAttribute('href', 'https://gallica.bnf.fr/services/engine/search/sru?query=Divina%20commedia');

    expect(row('MDZ').getByRole('link', { name: 'federation.openProviderSite' }))
      .toHaveAttribute('href', 'https://www.digitale-sammlungen.de/search?query=Divina%20commedia');
  });

  it('shows no site link on a row without a site address', () => {
    render(<SearchExecutionPanel run={RUN} providers={PROVIDERS} busy={false} providerFilter="all"
      onProviderFilter={vi.fn()} act={vi.fn()} />);

    expect(row('ECODICES').queryByRole('link')).not.toBeInTheDocument();
  });
});
