import { describe, expect, it, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

const initial = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(initial, true);
});

describe('uiStore drawer mutual exclusion', () => {
  it('opening the config drawer closes settings, help and both insight drawers', () => {
    useUiStore.setState({
      showSettings: true,
      showHelp: true,
      showDocumentDrawer: true,
      showChunkDrawer: true,
    });

    useUiStore.getState().setShowConfigDrawer(true);

    const state = useUiStore.getState();
    expect(state.showConfigDrawer).toBe(true);
    expect(state.showDocumentDrawer).toBe(false);
    expect(state.showChunkDrawer).toBe(false);
    expect(state.showSettings).toBe(false);
    expect(state.showHelp).toBe(false);
  });

  it('opening the document drawer closes the config drawer and remembers the tab', () => {
    useUiStore.setState({ showConfigDrawer: true, documentDrawerTab: 'index' });

    useUiStore.getState().setShowDocumentDrawer(true, 'stats');

    const state = useUiStore.getState();
    expect(state.showDocumentDrawer).toBe(true);
    expect(state.documentDrawerTab).toBe('stats');
    expect(state.showConfigDrawer).toBe(false);
  });

  it('opening document drawer without a tab keeps the previously selected tab', () => {
    useUiStore.getState().setDocumentDrawerTab('stats');

    useUiStore.getState().setShowDocumentDrawer(true);

    expect(useUiStore.getState().documentDrawerTab).toBe('stats');
  });

  it('opening settings closes both drawers but leaves the help flag alone when help was already off', () => {
    useUiStore.setState({ showConfigDrawer: true, showDocumentDrawer: true, showChunkDrawer: true });

    useUiStore.getState().setShowSettings(true);

    const state = useUiStore.getState();
    expect(state.showSettings).toBe(true);
    expect(state.showConfigDrawer).toBe(false);
    expect(state.showDocumentDrawer).toBe(false);
    expect(state.showChunkDrawer).toBe(false);
  });

  it('closing a drawer does not toggle other panels', () => {
    useUiStore.setState({ showSettings: true, showConfigDrawer: true });

    useUiStore.getState().setShowConfigDrawer(false);

    const state = useUiStore.getState();
    expect(state.showConfigDrawer).toBe(false);
    expect(state.showSettings).toBe(true);
  });

  it('changing view mode closes document drawers', () => {
    useUiStore.setState({
      viewMode: 'document',
      showConfigDrawer: true,
      showDocumentDrawer: true,
    });

    useUiStore.getState().setViewMode('sandbox');

    const state = useUiStore.getState();
    expect(state.viewMode).toBe('sandbox');
    expect(state.showConfigDrawer).toBe(false);
    expect(state.showDocumentDrawer).toBe(false);
  });

  it('opening the chunk drawer closes config drawer and remembers the tab', () => {
    useUiStore.setState({ showConfigDrawer: true, chunkDrawerTab: 'audit' });

    useUiStore.getState().setShowChunkDrawer(true, 'notes');

    const state = useUiStore.getState();
    expect(state.showChunkDrawer).toBe(true);
    expect(state.chunkDrawerTab).toBe('notes');
    expect(state.showConfigDrawer).toBe(false);
  });
});
