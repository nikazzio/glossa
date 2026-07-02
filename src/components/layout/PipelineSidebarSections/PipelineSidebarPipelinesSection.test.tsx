import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../../stores/projectStore';
import { useConfigStore } from '../../../stores/configStore';
import { useUiStore } from '../../../stores/uiStore';
import { PipelineSidebarPipelinesSection } from './PipelineSidebarPipelinesSection';

const initialUiState = useUiStore.getState();

const switchPipeline = vi.fn().mockResolvedValue(undefined);

function seedPipelines() {
  useProjectStore.setState({
    currentProjectId: 'project-1',
    activePipelineId: 'p1',
    pipelines: [
      { id: 'p1', name: 'Pipeline 1', mode: 'standard' },
      { id: 'p2', name: 'Pipeline 2', mode: 'standard' },
    ] as never,
    switchPipeline,
    createNewPipeline: vi.fn(),
    deletePipeline: vi.fn(),
  });
  useConfigStore.setState({ maxPipelines: 4 });
}

describe('PipelineSidebarPipelinesSection — trigger configurazione (#291)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState(initialUiState, true);
    seedPipelines();
  });

  it("mostra un unico pulsante configure nella card e un pulsante Cambia in modalità 'circle'", () => {
    render(<PipelineSidebarPipelinesSection configTrigger="circle" />);

    // Un solo pulsante Configura (per la pipeline attiva) — nessun gear per ogni cerchio.
    expect(screen.getAllByRole('button', { name: 'pipeline.configurePipeline' })).toHaveLength(1);
    // Pulsante Cambia per aprire il popover di selezione pipeline.
    expect(screen.getByRole('button', { name: 'pipeline.changePipeline' })).toBeInTheDocument();
  });

  it("apre la configurazione della pipeline attiva senza chiamare switchPipeline", async () => {
    render(<PipelineSidebarPipelinesSection configTrigger="circle" />);

    const gear = screen.getByRole('button', { name: 'pipeline.configurePipeline' });
    // La pipeline attiva è p1: il gear la configura senza switchPipeline.
    fireEvent.click(gear);

    expect(switchPipeline).not.toHaveBeenCalled();
    await waitFor(() => expect(useUiStore.getState().showConfigDrawer).toBe(true));
  });

  it("in modalità 'bottom' (shell vecchia) resta un solo pulsante config in fondo", () => {
    render(<PipelineSidebarPipelinesSection />);

    expect(screen.getAllByRole('button', { name: 'pipeline.configurePipeline' })).toHaveLength(1);
  });
});
