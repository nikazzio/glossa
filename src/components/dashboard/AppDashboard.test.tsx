import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDashboard } from './AppDashboard';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';

const mocks=vi.hoisted(() => ({counts:vi.fn(),sources:vi.fn(),facts:vi.fn(),projects:vi.fn(),attention:vi.fn()}));
vi.mock('../../services/dashboardService', () => ({dashboardCounts:mocks.counts,recentSources:mocks.sources,recentFacts:mocks.facts}));
vi.mock('../../services/projectService', () => ({listRecentProjectsAllWorkspaces:mocks.projects,listProjectsNeedingAttention:mocks.attention}));
vi.mock('../../hooks/useFederatedSearch', () => ({useFederatedSearch:() => ({runs:[],loading:false,error:null,refresh:vi.fn()})}));

describe('Dashboard overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for(const mock of [mocks.sources,mocks.facts,mocks.projects,mocks.attention]) mock.mockResolvedValue([]);
    mocks.counts.mockResolvedValue({sources:12,transcriptions:3,projects:4,workspaces:2});
    useUiStore.setState({location:{area:'dashboard'}});
    useWorkspaceStore.setState({workspaces:[{id:'w',name:'Workspace'}] as never});
    useProjectStore.setState({openProjectInWorkspace:vi.fn().mockResolvedValue(undefined)});
  });
  it('shows actual holdings and links search without rendering a search form', async () => {
    render(<AppDashboard />);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'federation.launch'}));
    expect(useUiStore.getState().location).toMatchObject({area:'library',view:'search'});
  });
  it('opens a recent translation in its own workspace', async () => {
    mocks.projects.mockResolvedValue([{id:'p',name:'Dante',workspace_id:'w',workspace_name:'Workspace'}]);
    render(<AppDashboard />);
    await screen.findByText('Dante');
    await userEvent.click(screen.getByRole('button',{name:'overview.openProject'}));
    expect(useProjectStore.getState().openProjectInWorkspace).toHaveBeenCalledWith('p','w');
  });
  it('keeps other sections available if holdings cannot be read', async () => {
    mocks.counts.mockRejectedValue(new Error('offline'));
    mocks.projects.mockResolvedValue([{id:'p',name:'Dante',workspace_id:'w',workspace_name:'Workspace'}]);
    render(<AppDashboard />);
    expect(await screen.findByText('Dante')).toBeInTheDocument();
    expect(await screen.findByText('dashboard.loadFailed')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
  });
  it('allows sections to collapse with keyboard-accessible controls', async () => {
    render(<AppDashboard />);
    const control=screen.getByRole('button',{name:'dashboard.section.expand'});
    expect(control).toHaveAttribute('aria-expanded','false');
    await userEvent.click(control);
    expect(control).toHaveAttribute('aria-expanded','true');
    await waitFor(() => expect(screen.getByText('dashboard.activityEmpty')).toBeVisible());
  });
});
