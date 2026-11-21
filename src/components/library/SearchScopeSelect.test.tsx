import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { openUrl } from '@tauri-apps/plugin-opener';
import '../../test/i18n-mock';
import { SearchScopeSelect, allLibraries } from './SearchScopeSelect';
import { RecognizedWorks } from './RecognizedWorks';
import type { IIIFProvider } from '../../types';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));

function provider(key: string, kind: IIIFProvider['kind'], supportsSearch = true, siteSearch = ''): IIIFProvider {
  return {
    key, label: key.toUpperCase(), aliases: [], placeholder: '', isEnabled: true, resolver: key,
    searchHandler: supportsSearch ? key : null, supportsDirectResolution: true, supportsSearch, kind,
    availability: supportsSearch ? 'searchable' : 'directOnly', siteSearch, searchFields: [],
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
    render(<SearchScopeSelect providers={PROVIDERS} chosen={['gallica', 'mdz']} query="" onChange={onChange} onCustomize={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'federation.scope.label' });

    expect(select).toHaveValue('all');
    fireEvent.change(select, { target: { value: 'gallica' } });
    expect(onChange).toHaveBeenCalledWith(['gallica']);
  });

  it('la scelta personalizzata apre i criteri', () => {
    const onCustomize = vi.fn();
    render(<SearchScopeSelect providers={PROVIDERS} chosen={['gallica']} query="" onChange={vi.fn()} onCustomize={onCustomize} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } });
    expect(onCustomize).toHaveBeenCalledOnce();
  });
});

describe('SearchScopeSelect — libraries only on their website', () => {
  const WITH_SITES = [
    ...PROVIDERS,
    provider('harvard', 'library', false, 'https://id.lib.harvard.edu/search?q={query}'),
    provider('generic', 'library', false, ''),
  ];

  it('lists them in a separate group, without the ones lacking a site address', () => {
    render(<SearchScopeSelect providers={WITH_SITES} chosen={['gallica', 'mdz']} query="" onChange={vi.fn()} onCustomize={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'federation.siteOnly' });
    expect(group).toHaveTextContent('HARVARD');
    expect(group).not.toHaveTextContent('GENERIC');
    expect(group).not.toHaveTextContent('HEIDELBERG');
  });

  it('opens the website with the typed words and leaves the scope unchanged', () => {
    const onChange = vi.fn();
    render(<SearchScopeSelect providers={WITH_SITES} chosen={['gallica', 'mdz']} query="Beatus vir" onChange={onChange} onCustomize={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'federation.scope.label' });

    fireEvent.change(select, { target: { value: 'site:harvard' } });

    expect(openUrl).toHaveBeenCalledWith('https://id.lib.harvard.edu/search?q=Beatus%20vir');
    expect(onChange).not.toHaveBeenCalled();
    expect(select).toHaveValue('all');
  });

  it('keeps them out of «all»', () => {
    expect(allLibraries(WITH_SITES)).toEqual(['gallica', 'mdz']);
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
