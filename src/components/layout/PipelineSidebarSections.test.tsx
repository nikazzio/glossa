import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../stores/projectStore';
import { useConfigStore } from '../../stores/configStore';
import { useUiStore } from '../../stores/uiStore';
import { PipelineSidebarPipelinesSection } from './PipelineSidebarSections';

const initialUiState = useUiStore.getState();

const switchPipeline = vi.fn();

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

  it("mostra un ingranaggio per ogni cerchio e nessun pulsante config in fondo in modalità 'circle'", () => {
    render(<PipelineSidebarPipelinesSection configTrigger="circle" />);

    // Una sola affordance config per pipeline (nessun pulsante dedicato in fondo).
    expect(screen.getAllByRole('button', { name: 'pipeline.configurePipeline' })).toHaveLength(2);
  });

  it("attiva la pipeline e apre la finestra di configurazione cliccando l'ingranaggio del cerchio", () => {
    render(<PipelineSidebarPipelinesSection configTrigger="circle" />);

    const gears = screen.getAllByRole('button', { name: 'pipeline.configurePipeline' });
    // Secondo cerchio = pipeline non attiva: cliccarlo la attiva e apre la config.
    fireEvent.click(gears[1]);

    expect(switchPipeline).toHaveBeenCalledWith('p2');
    expect(useUiStore.getState().showConfigDrawer).toBe(true);
  });

  it("in modalità 'bottom' (shell vecchia) resta un solo pulsante config in fondo", () => {
    render(<PipelineSidebarPipelinesSection />);

    expect(screen.getAllByRole('button', { name: 'pipeline.configurePipeline' })).toHaveLength(1);
  });
});
