import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../test/i18n-mock';
import { SourceListRow } from './SourceListRow';
import type { IIIFDiscoveryResult } from '../../types';

const mockInspect = vi.fn();

vi.mock('../../services/iiifProviderService', () => ({
  inspectManifest: (...args: unknown[]) => mockInspect(...args),
}));

/** Quello che il motore risponde quando del manifesto non ha saputo niente. */
const UNKNOWN_FACTS = { openable: null, pages: null, samplePixels: null, document: null, renderings: [] };

function card(overrides: Partial<IIIFDiscoveryResult> = {}): IIIFDiscoveryResult {
  return {
    id: 'one', title: 'First source', creator: null, date: null, description: null, thumbnailUrl: null,
    mediaType: null, collection: null, language: null, volume: null, subjects: [], itemCount: null,
    contributors: [], publisher: null, rights: [], physicalDescription: null, holdingInstitution: null,
    catalogUrl: null, pageUrl: null, manifestUrl: 'https://example.test/one',
    ...overrides,
  };
}

function renderRow(result: IIIFDiscoveryResult, expanded = false) {
  return render(
    <SourceListRow card={result} providerKey="archive_org" providerLabel="Internet Archive"
      expanded={expanded} onToggle={vi.fn()} onAddToLibrary={vi.fn()} onAddToWorkspace={vi.fn()}
      adding={false} alreadyAdded={false} />,
  );
}

describe('SourceListRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInspect.mockResolvedValue(UNKNOWN_FACTS);
  });

  it('mette in evidenza chi, quando e dove, e scrive l\'istituzione nella riga piccola', () => {
    renderRow(card({ creator: 'Dante Alighieri', date: '1481', holdingInstitution: 'Biblioteca Estense Universitaria' }));

    expect(screen.getByText('Dante Alighieri').tagName).toBe('STRONG');
    expect(screen.getByText('1481', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Biblioteca Estense Universitaria', { exact: false })).toBeInTheDocument();
  });

  it('shows every metadata field when the row is expanded, not just title and author', () => {
    renderRow(card({
      title: 'Le guidon des capitaines', creator: 'Strozzi, Filippo', date: '1610',
      contributors: ['Cavalcabo, Girolamo', 'Villamont, Jacques de. Traducteur'],
      publisher: 'Claude Le Villain (Rouen)', rights: ['domaine public'],
      physicalDescription: '23-[1 bl.] p. ; in-12',
      holdingInstitution: 'Bibliothèque nationale de France, V-22944',
      catalogUrl: 'http://catalogue.bnf.fr/ark:/12148/cb33412414z',
      pageUrl: 'https://gallica.bnf.fr/ark:/12148/bpt6k3282120',
    }), true);

    expect(screen.getByText('Cavalcabo, Girolamo · Villamont, Jacques de. Traducteur')).toBeInTheDocument();
    expect(screen.getAllByText('Claude Le Villain (Rouen)', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText('domaine public')).toBeInTheDocument();
    expect(screen.getByText('23-[1 bl.] p. ; in-12')).toBeInTheDocument();
    expect(screen.getByText('Bibliothèque nationale de France, V-22944')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cb33412414z/ })).toHaveAttribute('href', 'http://catalogue.bnf.fr/ark:/12148/cb33412414z');
  });

  it('shows the page count on the collapsed row', () => {
    renderRow(card({ itemCount: 372 }));

    expect(screen.getByText(/372 pages/)).toBeInTheDocument();
  });

  it('says nothing about pages when the catalogue does not declare the count', () => {
    renderRow(card());

    expect(screen.queryByText(/page/i)).not.toBeInTheDocument();
  });

  it('opens and closes from its own command', async () => {
    const onToggle = vi.fn();
    render(
      <SourceListRow card={card()} providerKey="archive_org" providerLabel="Internet Archive"
        expanded={false} onToggle={onToggle} onAddToLibrary={vi.fn()} onAddToWorkspace={vi.fn()}
        adding={false} alreadyAdded={false} />,
    );
    const row = screen.getByText('First source').closest('article');
    if (!row) throw new Error('row not found');

    await userEvent.setup().click(within(row).getByRole('button', { name: 'federation.details' }));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('marks a result the library says it does not have, without hiding it or reading its manifest', () => {
    renderRow(card({ title: 'Solo in catalogo', manifestUrl: 'https://example.test/assente', openable: false }));

    expect(screen.getByText('Solo in catalogo')).toBeInTheDocument();
    expect(screen.getByText('dashboard.discovery.notOpenable')).toBeInTheDocument();
    expect(mockInspect).not.toHaveBeenCalled();
  });

  it('checks a result the library did not tell us about', async () => {
    mockInspect.mockResolvedValue({ ...UNKNOWN_FACTS, openable: false });
    renderRow(card({ manifestUrl: 'https://example.test/ignoto' }));

    expect(await screen.findByText('dashboard.discovery.notOpenable')).toBeInTheDocument();
    expect(mockInspect).toHaveBeenCalledWith('archive_org', 'https://example.test/ignoto');
  });
});
