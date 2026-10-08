import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDashboard } from './AppDashboard';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';

const mocks=vi.hoisted(() => ({counts:vi.fn(),sources:vi.fn(),transcriptions:vi.fn(),projects:vi.fn(),attention:vi.fn(),progress:vi.fn(),month:vi.fn()}));
vi.mock('../../services/dashboardService', () => ({dashboardCounts:mocks.counts,recentSources:mocks.sources,recentTranscriptions:mocks.transcriptions}));
vi.mock('../../services/projectService', () => ({listRecentProjectsAllWorkspaces:mocks.projects,listProjectsNeedingAttention:mocks.attention}));
vi.mock('../../services/workProgressService', () => ({loadWorkProgress:mocks.progress}));
vi.mock('../../services/statsService', () => ({loadMonthSummary:mocks.month}));
vi.mock('../../hooks/useFederatedSearch', () => ({useFederatedSearch:() => ({runs:[],loading:false,error:null,refresh:vi.fn()})}));

describe('Dashboard overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for(const mock of [mocks.sources,mocks.transcriptions,mocks.projects,mocks.attention,mocks.progress]) mock.mockResolvedValue([]);
    mocks.month.mockResolvedValue({pages:3,fragments:5,phrases:2,usage:[]});
    mocks.counts.mockResolvedValue({sources:12,transcriptions:3,projects:4,workspaces:2});
    useUiStore.setState({location:{area:'dashboard'},dashboardSections:{}});
    useWorkspaceStore.setState({workspaces:[{id:'w',name:'Workspace'}] as never});
    useProjectStore.setState({openProjectInWorkspace:vi.fn().mockResolvedValue(undefined)});
  });
  it('shows actual holdings and links search without rendering a search form', async () => {
    render(<AppDashboard />);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'federation.launch'}));
    expect(useUiStore.getState().location).toMatchObject({area:'dashboard',view:'search'});
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
    expect(await screen.findByText('overview.progressEmpty')).toBeVisible();
    const control=screen.getAllByRole('button',{name:'dashboard.section.collapse'})[0];
    expect(control).toHaveAttribute('aria-expanded','true');
    await userEvent.click(control);
    expect(control).toHaveAttribute('aria-expanded','false');
    await waitFor(() => expect(screen.queryByText('overview.progressEmpty')).not.toBeInTheDocument());
  });
  it('lists recent transcriptions in resume and opens them', async () => {
    mocks.transcriptions.mockResolvedValue([{id:'d',title:'Vat. lat. 3225',workspace_id:'w',edited_at:'2026-10-07 10:00:00'}]);
    render(<AppDashboard />);
    await screen.findByText('Vat. lat. 3225');
    await userEvent.click(screen.getByRole('button',{name:'overview.openTranscription'}));
    expect(useUiStore.getState().location).toMatchObject({area:'transcriptions',documentId:'d'});
  });
  it('shows this month in one line and links to statistics', async () => {
    render(<AppDashboard />);
    await screen.findByText('overview.thisMonth');
    await userEvent.click(screen.getByRole('button',{name:'overview.openStats'}));
    expect(useUiStore.getState().location).toMatchObject({area:'dashboard',view:'stats'});
  });
});
