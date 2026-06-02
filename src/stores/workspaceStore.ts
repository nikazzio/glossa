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
  loadWorkspaces: () => Promise<void>;
  setActive: (workspace: Workspace) => Promise<void>;
};

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  loading: false,

  loadWorkspaces: async () => {
    set({ loading: true });
    try {
      const [workspaces, activeId] = await Promise.all([
        listWorkspaces(),
        getActiveWorkspaceId(),
      ]);
      const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;
      set({ workspaces, activeWorkspace, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  setActive: async (workspace) => {
    await setActiveWorkspaceId(workspace.id);
    set({ activeWorkspace: workspace });
  },
}));
