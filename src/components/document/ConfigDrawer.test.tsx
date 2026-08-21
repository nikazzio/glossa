import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigDrawer } from './ConfigDrawer';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import type { Pipeline } from '../../types';

vi.mock('../../services/glossaryService', () => ({
  assignGlossaryToProject: vi.fn(),
  upsertGlossaryEntries: vi.fn(),
  listGlossaries: vi.fn().mockResolvedValue([]),
}));

describe('ConfigDrawer pipeline name field', () => {
  beforeEach(() => {
    const pipeline: Pipeline = {
      id: 'pipe-1',
      projectId: 'proj-1',
      name: 'Draft A',
      sourceLanguage: 'it',
      targetLanguage: 'en',
      mode: 'standard',
      runStatus: 'idle',
      lastRunConfig: null,
      createdAt: '2026-08-22',
      updatedAt: '2026-08-22',
    };
    useUiStore.setState({ showConfigDrawer: true });
    useProjectStore.setState({
      currentProjectId: 'proj-1',
      activePipelineId: 'pipe-1',
      pipelines: [pipeline],
      renamePipeline: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('shows confirm/cancel controls only while the name is dirty', () => {
    render(
      <ConfigDrawer onRunPipeline={() => {}} onRunAuditOnly={() => {}} onCancelPipeline={() => {}} />,
    );
    const input = screen.getByLabelText('pipeline.pipelineNameLabel') as HTMLInputElement;
    expect(screen.queryByRole('button', { name: 'common.confirm' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Draft B' } });
    expect(screen.getByRole('button', { name: 'common.confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
  });

  it('cancel reverts to the committed name without calling renamePipeline', () => {
    const { renamePipeline } = useProjectStore.getState();
    render(
      <ConfigDrawer onRunPipeline={() => {}} onRunAuditOnly={() => {}} onCancelPipeline={() => {}} />,
    );
    const input = screen.getByLabelText('pipeline.pipelineNameLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Draft B' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(input.value).toBe('Draft A');
    expect(renamePipeline).not.toHaveBeenCalled();
  });
});
