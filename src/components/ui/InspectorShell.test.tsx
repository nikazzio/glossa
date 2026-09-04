import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InspectorShell, type InspectorTab } from './InspectorShell';

const TABS: InspectorTab[] = [
  { id: 'a', label: 'Alpha', icon: <span>A</span> },
  { id: 'b', label: 'Beta', icon: <span>B</span>, disabled: true },
  { id: 'c', label: 'Gamma', icon: <span>C</span> },
];

describe('InspectorShell', () => {
  it('clicking a tab calls onTabChange', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorShell ariaLabel="Test" tabs={TABS} activeTab="a" onTabChange={onTabChange}>
        <p>contenuto</p>
      </InspectorShell>,
    );

    await user.click(screen.getByRole('tab', { name: 'Gamma' }));

    expect(onTabChange).toHaveBeenCalledWith('c');
  });

  it('arrow navigation skips disabled tabs', async () => {
    const onTabChange = vi.fn();
    render(
      <InspectorShell ariaLabel="Test" tabs={TABS} activeTab="a" onTabChange={onTabChange}>
        <p>contenuto</p>
      </InspectorShell>,
    );

    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    // «Beta» è disattivato: la freccia salta direttamente a «Gamma».
    expect(onTabChange).toHaveBeenCalledWith('c');
  });

  it('shows the actions slot next to the tab bar', () => {
    render(
      <InspectorShell
        ariaLabel="Test"
        tabs={TABS}
        activeTab="a"
        onTabChange={vi.fn()}
        actions={<button type="button">Chiudi</button>}
      >
        <p>contenuto</p>
      </InspectorShell>,
    );

    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeInTheDocument();
    expect(screen.getByText('contenuto')).toBeInTheDocument();
  });

  it('with no panelLabel, there is no collapse header at all', () => {
    render(
      <InspectorShell ariaLabel="Test" tabs={TABS} activeTab="a" onTabChange={vi.fn()}>
        <p>contenuto</p>
      </InspectorShell>,
    );

    expect(screen.queryByRole('button', { name: 'sidebar.collapse' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('with a panelLabel, shows the header with the collapse toggle and label', () => {
    render(
      <InspectorShell
        ariaLabel="Test"
        tabs={TABS}
        activeTab="a"
        onTabChange={vi.fn()}
        panelLabel="Pannello"
        collapsed={false}
        onCollapsedChange={vi.fn()}
      >
        <p>contenuto</p>
      </InspectorShell>,
    );

    expect(screen.getByText('Pannello')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sidebar.collapse' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('when collapsed, shows only the expand command — no tabs, no content', () => {
    const onCollapsedChange = vi.fn();
    render(
      <InspectorShell
        ariaLabel="Test"
        tabs={TABS}
        activeTab="a"
        onTabChange={vi.fn()}
        panelLabel="Pannello"
        collapsed
        onCollapsedChange={onCollapsedChange}
      >
        <p>contenuto</p>
      </InspectorShell>,
    );

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('contenuto')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sidebar.expand' })).toBeInTheDocument();
  });

  it('clicking the collapse/expand command calls onCollapsedChange', async () => {
    const onCollapsedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorShell
        ariaLabel="Test"
        tabs={TABS}
        activeTab="a"
        onTabChange={vi.fn()}
        panelLabel="Pannello"
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
      >
        <p>contenuto</p>
      </InspectorShell>,
    );

    await user.click(screen.getByRole('button', { name: 'sidebar.collapse' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});
