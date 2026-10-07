import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectDialog } from './CreateProjectDialog';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { importTextFile } from '../../services/fileService';
import '../../test/i18n-mock';

vi.mock('../../services/fileService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/fileService')>()),
  importTextFile: vi.fn(),
}));

vi.mock('../../services/projectService', () => ({ listProjectSourceVersions: vi.fn().mockResolvedValue([{ id: 'version-a', title: 'Fiore', label: 'Testimone A' }]) }));

describe('CreateProjectDialog', () => {
  const createAndOpen = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ createAndOpen });
    useUiStore.setState({ pendingImportFile: null });
    useWorkspaceStore.setState({
      workspaces: [
        { id: 'ws-1', name: 'Archivio' } as never,
        { id: 'ws-2', name: 'Ricerca' } as never,
      ],
    });
  });

  it('creates directly in the given workspaceId, without showing a picker', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-2" />);

    expect(screen.queryByLabelText('projects.chooseWorkspace')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Nuovo progetto');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));

    expect(createAndOpen).toHaveBeenCalledWith('Nuovo progetto', 'ws-2', undefined);
  });

  it('requires an explicit workspace pick when none is given (never falls back silently)', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} />);

    expect(screen.getByLabelText('projects.chooseWorkspace')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('projects.chooseWorkspace'), 'ws-2');
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Nuovo progetto');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));

    expect(createAndOpen).toHaveBeenCalledWith('Nuovo progetto', 'ws-2', undefined);
  });

  it('keeps create disabled when there is no workspace to pick from', async () => {
    useWorkspaceStore.setState({ workspaces: [] });
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Nuovo progetto');

    expect(screen.getByRole('button', { name: 'projects.create' })).toBeDisabled();
    expect(createAndOpen).not.toHaveBeenCalled();
  });

  it('hands the chosen file to the import preview once the translation is created', async () => {
    const file = { name: 'de-officiis.txt', text: 'Quamquam te, Marce fili', format: 'plain' as const };
    vi.mocked(importTextFile).mockResolvedValue(file);
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-1" />);

    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'De officiis');
    await user.click(screen.getByRole('button', { name: 'projects.chooseSourceFile' }));
    expect(await screen.findByText('de-officiis.txt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'projects.create' }));

    expect(createAndOpen).toHaveBeenCalledWith('De officiis', 'ws-1', undefined);
    expect(useUiStore.getState().pendingImportFile).toEqual(file);
  });

  it('shows why an unreadable file was refused and creates nothing', async () => {
    vi.mocked(importTextFile).mockRejectedValue(new Error('pdf_no_text_layer'));
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-1" />);

    await user.click(screen.getByRole('button', { name: 'projects.chooseSourceFile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('files.pdfScannedError');
    expect(createAndOpen).not.toHaveBeenCalled();
    expect(useUiStore.getState().pendingImportFile).toBeNull();
  });

  it('links an explicitly selected book version without guessing from the file', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-1" />);
    const picker = screen.getByRole('button', { name: 'projects.chooseSourceBook' });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.click(picker);
    await user.click(await screen.findByRole('button', { name: /Fiore\s*Testimone A/ }));
    expect(screen.getByText('Fiore')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));
    expect(createAndOpen).toHaveBeenCalledWith('Fiore', 'ws-1', 'version-a');
  });

  it('clears the chosen book with the X button and creates without a book', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-1" />);
    const picker = screen.getByRole('button', { name: 'projects.chooseSourceBook' });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.click(picker);
    await user.click(await screen.findByRole('button', { name: /Fiore\s*Testimone A/ }));
    await user.click(screen.getByRole('button', { name: 'projects.clearSourceBook' }));
    expect(screen.getByText('memory.provenance.noBook')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));
    expect(createAndOpen).toHaveBeenCalledWith('Fiore', 'ws-1', undefined);
  });
  it('creates an empty translation when no file is chosen', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-1" />);

    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Bozza');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));

    expect(createAndOpen).toHaveBeenCalledWith('Bozza', 'ws-1', undefined);
    expect(useUiStore.getState().pendingImportFile).toBeNull();
  });
});
