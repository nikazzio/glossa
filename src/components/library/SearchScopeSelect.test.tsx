import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../test/i18n-mock';
import { SearchScopeSelect, allLibraries } from './SearchScopeSelect';
import { RecognizedWorks } from './RecognizedWorks';
import type { IIIFProvider } from '../../types';

function provider(key: string, kind: IIIFProvider['kind'], supportsSearch = true): IIIFProvider {
  return {
    key, label: key.toUpperCase(), aliases: [], placeholder: '', isEnabled: true, resolver: key,
    searchHandler: supportsSearch ? key : null, supportsDirectResolution: true, supportsSearch, kind,
    availability: supportsSearch ? 'searchable' : 'directOnly', siteSearch: '', searchFields: [],
  };
}

const PROVIDERS = [provider('gallica', 'library'), provider('mdz', 'library'), provider('europeana', 'aggregator'), provider('heidelberg', 'library', false)];

describe('SearchScopeSelect', () => {
  it('«tutte» vuol dire le biblioteche che cercano, senza le raccolte', () => {
    expect(allLibraries(PROVIDERS)).toEqual(['gallica', 'mdz']);
  });

  it('«tutte» lascia fuori Library of Congress e Scozia, che si scelgono a mano', () => {
    expect(allLibraries([...PROVIDERS, provider('loc', 'library'), provider('nls', 'library')])).toEqual(['gallica', 'mdz']);
  });

  it('mostra la scelta attuale e cambia fonte con una scelta sola', () => {
    const onChange = vi.fn();
    render(<SearchScopeSelect providers={PROVIDERS} chosen={['gallica', 'mdz']} onChange={onChange} onCustomize={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'federation.scope.label' });

    expect(select).toHaveValue('all');
    fireEvent.change(select, { target: { value: 'gallica' } });
    expect(onChange).toHaveBeenCalledWith(['gallica']);
  });

  it('la scelta personalizzata apre i criteri', () => {
    const onCustomize = vi.fn();
    render(<SearchScopeSelect providers={PROVIDERS} chosen={['gallica']} onChange={vi.fn()} onCustomize={onCustomize} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } });
    expect(onCustomize).toHaveBeenCalledOnce();
  });
});

describe('RecognizedWorks', () => {
  it('non mostra niente quando nessuna biblioteca riconosce quello che è scritto', () => {
    const { container } = render(<RecognizedWorks recognitions={[]} providers={PROVIDERS} opening={null} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('propone di aprire l\'opera riconosciuta', () => {
    const onOpen = vi.fn();
    render(<RecognizedWorks recognitions={[{ providerKey: 'gallica', docId: 'bpt6k3282120' }]} providers={PROVIDERS}
      opening={null} onOpen={onOpen} />);

    expect(screen.getByText('bpt6k3282120')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'federation.openDirectlyAction' }));
    expect(onOpen).toHaveBeenCalledWith('gallica');
  });
});
