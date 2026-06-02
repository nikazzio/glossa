import { create } from 'zustand';
import type { Workspace } from '../types';
import {
  getActiveWorkspaceId,
  listWorkspaces,
  setActiveWorkspaceId,
} from '../services/workspaceService';

type WorkspaceStore = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  /** true dopo il primo caricamento completato (successo o errore). */
  isLoaded: boolean;
  loadWorkspaces: () => Promise<void>;
  setActive: (workspace: Workspace) => Promise<void>;
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
      const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;
      set({ workspaces, activeWorkspace, loading: false, isLoaded: true });
    } catch (err) {
      set({ loading: false, isLoaded: true });
      throw err;
    }
  },

  setActive: async (workspace) => {
    await setActiveWorkspaceId(workspace.id);
    set({ activeWorkspace: workspace });
  },
}));
