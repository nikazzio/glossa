import { describe, expect, it, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

const initial = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(initial, true);
});

describe('uiStore drawer mutual exclusion', () => {
  it('opening the config drawer closes settings, help and the insights drawer', () => {
    useUiStore.setState({
      showSettings: true,
      showHelp: true,
      showInsightsDrawer: true,
    });

    useUiStore.getState().setShowConfigDrawer(true);

    const state = useUiStore.getState();
    expect(state.showConfigDrawer).toBe(true);
    expect(state.showInsightsDrawer).toBe(false);
    expect(state.showSettings).toBe(false);
    expect(state.showHelp).toBe(false);
  });

  it('opening the insights drawer closes the config drawer and remembers the tab', () => {
    useUiStore.setState({ showConfigDrawer: true, insightsDrawerTab: 'index' });

    useUiStore.getState().setShowInsightsDrawer(true, 'audit');

    const state = useUiStore.getState();
    expect(state.showInsightsDrawer).toBe(true);
    expect(state.insightsDrawerTab).toBe('audit');
    expect(state.showConfigDrawer).toBe(false);
  });

  it('opening insights without a tab keeps the previously selected tab', () => {
    useUiStore.getState().setInsightsDrawerTab('audit');

    useUiStore.getState().setShowInsightsDrawer(true);

    expect(useUiStore.getState().insightsDrawerTab).toBe('audit');
  });

  it('opening settings closes the drawers but leaves the help flag alone when help was already off', () => {
    useUiStore.setState({ showConfigDrawer: true, showInsightsDrawer: true });

    useUiStore.getState().setShowSettings(true);

    const state = useUiStore.getState();
    expect(state.showSettings).toBe(true);
    expect(state.showConfigDrawer).toBe(false);
    expect(state.showInsightsDrawer).toBe(false);
  });

  it('closing a drawer does not toggle other panels', () => {
    useUiStore.setState({ showSettings: true, showConfigDrawer: true });

    useUiStore.getState().setShowConfigDrawer(false);

    const state = useUiStore.getState();
    expect(state.showConfigDrawer).toBe(false);
    expect(state.showSettings).toBe(true);
  });
});
