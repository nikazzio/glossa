import { create } from 'zustand';
import type { Workspace } from '../types';
import {
  createWorkspace,
  deleteWorkspace,
  getActiveWorkspaceId,
  listWorkspaces,
  setActiveWorkspaceId,
  updateWorkspace,
} from '../services/workspaceService';
import type { EmbeddingModel } from '../types';

type WorkspaceStore = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  /** true dopo il primo caricamento completato (successo o errore). */
  isLoaded: boolean;
  loadWorkspaces: () => Promise<void>;
  createAndActivate: (params: { name: string; description?: string; embeddingModel: EmbeddingModel }) => Promise<Workspace>;
  setActive: (workspace: Workspace) => Promise<void>;
  updateActiveWorkspace: (updates: Partial<Pick<Workspace, 'name' | 'description' | 'embeddingModel'>>) => Promise<void>;
  removeWorkspace: (workspaceId: string) => Promise<void>;
};

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  loading: false,
  isLoaded: false,

  loadWorkspaces: async () => {
    set({ loading: true });
    try {
      const [workspaces, activeId] = await Promise.all([
        listWorkspaces(),
        getActiveWorkspaceId(),
      ]);
      const found = workspaces.find((w) => w.id === activeId);
      const activeWorkspace = found ?? workspaces[0] ?? null;
      if (!found && activeWorkspace) {
        await setActiveWorkspaceId(activeWorkspace.id);
      }
      set({ workspaces, activeWorkspace, loading: false, isLoaded: true });
    } catch (err) {
      set({ loading: false, isLoaded: true });
      throw err;
    }
  },

  createAndActivate: async (params) => {
    const workspace = await createWorkspace(params);
    await setActiveWorkspaceId(workspace.id);
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspace: workspace,
      isLoaded: true,
    }));
    return workspace;
  },

  setActive: async (workspace) => {
    await setActiveWorkspaceId(workspace.id);
    set({ activeWorkspace: workspace });
  },

  updateActiveWorkspace: async (updates) => {
    const current = useWorkspaceStore.getState().activeWorkspace;
    if (!current) return;
    await updateWorkspace(current.id, updates);
    const next = { ...current, ...updates };
    set((state) => ({
      activeWorkspace: next,
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === current.id ? next : workspace,
      ),
    }));
  },

  removeWorkspace: async (workspaceId) => {
    await deleteWorkspace(workspaceId);
    await useWorkspaceStore.getState().loadWorkspaces();
  },
}));
