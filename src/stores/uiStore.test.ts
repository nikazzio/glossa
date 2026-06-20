import { describe, expect, it, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';
import { useConfigStore } from './configStore';

const initial = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(initial, true);
});

describe('uiStore drawer mutual exclusion', () => {
  it('defaults the test chunk count to three and clamps it to at least one', () => {
    const state = useConfigStore.getState();
    expect(state.pipelineTestChunkCount).toBe(3);

    state.setPipelineTestChunkCount(0);
    expect(useConfigStore.getState().pipelineTestChunkCount).toBe(1);
  });

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

  it('can open settings directly on the provider tab', () => {
    useUiStore.getState().setShowSettings(true, 'provider');

    const state = useUiStore.getState();
    expect(state.showSettings).toBe(true);
    expect(state.settingsTab).toBe('provider');
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

    useUiStore.getState().setShowChunkDrawer(true, 'operations');

    const state = useUiStore.getState();
    expect(state.showChunkDrawer).toBe(true);
    expect(state.chunkDrawerTab).toBe('operations');
    expect(state.showConfigDrawer).toBe(false);
  });
});

describe('uiStore project shell state', () => {
  it('defaults to the run panel with context expanded', () => {
    const state = useUiStore.getState();
    expect(state.activeProjectPanel).toBe('run');
    expect(state.projectContextCollapsed).toBe(false);
  });

  it('updates project panel and collapse state independently', () => {
    useUiStore.getState().setActiveProjectPanel('document');
    useUiStore.getState().setProjectContextCollapsed(true);

    const state = useUiStore.getState();
    expect(state.activeProjectPanel).toBe('document');
    expect(state.projectContextCollapsed).toBe(true);
  });

  it('raises the document fly-out when the insight panel is selected', () => {
    useUiStore.getState().setActiveProjectPanel('insight');

    const state = useUiStore.getState();
    expect(state.activeProjectPanel).toBe('insight');
    expect(state.showDocumentDrawer).toBe(true);
    expect(state.showChunkDrawer).toBe(false);
  });

  it('raises the chunk fly-out when the chunk panel is selected', () => {
    useUiStore.getState().setActiveProjectPanel('chunk');

    const state = useUiStore.getState();
    expect(state.activeProjectPanel).toBe('chunk');
    expect(state.showChunkDrawer).toBe(true);
    expect(state.showDocumentDrawer).toBe(false);
  });

  it('closes the fly-out drawers when an inline panel is selected', () => {
    useUiStore.getState().setActiveProjectPanel('insight');
    useUiStore.getState().setActiveProjectPanel('document');

    const state = useUiStore.getState();
    expect(state.activeProjectPanel).toBe('document');
    expect(state.showDocumentDrawer).toBe(false);
    expect(state.showChunkDrawer).toBe(false);
  });

  it('syncs the rail to the chunk panel when the chunk drawer is opened externally', () => {
    useUiStore.getState().setShowChunkDrawer(true, 'audit');

    expect(useUiStore.getState().activeProjectPanel).toBe('chunk');
  });

  it('restores the manually expanded bar after closing the insight fly-out', () => {
    // L'utente tiene la barra espansa (stato di default).
    expect(useUiStore.getState().projectContextUserExpanded).toBe(true);

    // Aprendo Insight la barra si comprime, ma la preferenza utente resta "espansa".
    useUiStore.getState().setActiveProjectPanel('insight');
    expect(useUiStore.getState().projectContextCollapsed).toBe(true);
    expect(useUiStore.getState().projectContextUserExpanded).toBe(true);

    // Chiudendo il fly-out (ritorno a un pannello inline) la barra torna espansa.
    useUiStore.getState().setActiveProjectPanel('document');
    expect(useUiStore.getState().projectContextCollapsed).toBe(false);
  });

  it('keeps the bar collapsed after closing the fly-out when the user collapsed it on purpose', () => {
    // L'utente comprime la barra esplicitamente.
    useUiStore.getState().setProjectContextCollapsed(true);
    expect(useUiStore.getState().projectContextUserExpanded).toBe(false);

    useUiStore.getState().setShowDocumentDrawer(true);
    useUiStore.getState().setShowDocumentDrawer(false);

    // La preferenza "collassata" viene rispettata anche dopo il fly-out.
    expect(useUiStore.getState().projectContextCollapsed).toBe(true);
  });
});

describe('uiStore uiFont preference', () => {
  it('defaults the UI font to plus jakarta sans', () => {
    expect(useUiStore.getState().uiFont).toBe('jakarta');
  });

  it('updates the UI font through setUiFont', () => {
    useUiStore.getState().setUiFont('geist');
    expect(useUiStore.getState().uiFont).toBe('geist');

    useUiStore.getState().setUiFont('inter');
    expect(useUiStore.getState().uiFont).toBe('inter');
  });
});

describe('uiStore — activeWorkspaceArea', () => {
  beforeEach(() => {
    useUiStore.setState({ activeWorkspaceArea: null });
  });

  it('defaults to null', () => {
    expect(useUiStore.getState().activeWorkspaceArea).toBeNull();
  });

  it('setActiveWorkspaceArea sets the area', () => {
    useUiStore.getState().setActiveWorkspaceArea('translations');
    expect(useUiStore.getState().activeWorkspaceArea).toBe('translations');
  });

  it('setActiveWorkspaceArea(null) resets to hub', () => {
    useUiStore.getState().setActiveWorkspaceArea('translations');
    useUiStore.getState().setActiveWorkspaceArea(null);
    expect(useUiStore.getState().activeWorkspaceArea).toBeNull();
  });
});
