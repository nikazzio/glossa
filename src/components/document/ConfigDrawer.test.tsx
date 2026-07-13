import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigDrawer } from './ConfigDrawer';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';

vi.mock('../../services/glossaryService', () => ({
  assignGlossaryToProject: vi.fn(),
  upsertGlossaryEntries: vi.fn(),
  listGlossaries: vi.fn().mockResolvedValue([]),
}));

describe('ConfigDrawer pipeline name field', () => {
  beforeEach(() => {
    useUiStore.setState({ showConfigDrawer: true });
    useProjectStore.setState({
      currentProjectId: 'proj-1',
      activePipelineId: 'pipe-1',
      pipelines: [{ id: 'pipe-1', name: 'Draft A' } as any],
      renamePipeline: vi.fn().mockResolvedValue(undefined),
    } as any);
  });

  it('shows confirm/cancel controls only while the name is dirty', () => {
    render(
      <ConfigDrawer onRunPipeline={() => {}} onRunAuditOnly={() => {}} onCancelPipeline={() => {}} />,
    );
    // react-i18next is globally mocked in src/test/setup.ts to return the raw key
    // (`t: (key) => key`), and IconButton's aria-label defaults to its `title` prop —
    // so query by the untranslated i18n key, not the Italian copy.
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
