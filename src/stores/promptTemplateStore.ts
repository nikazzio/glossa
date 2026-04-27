import { create } from 'zustand';
import type { PromptTemplate } from '../types';
import {
  getPromptTemplates,
  savePromptTemplate,
  deletePromptTemplate,
} from '../services/promptTemplateService';

interface PromptTemplateState {
  templates: PromptTemplate[];
  isLoaded: boolean;
  loadTemplates: () => Promise<void>;
  saveTemplate: (
    name: string,
    prompt: string,
    context: 'stage' | 'audit',
    defaultModel?: string,
    defaultProvider?: string,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

export const usePromptTemplateStore = create<PromptTemplateState>((set, get) => ({
  templates: [],
  isLoaded: false,

  loadTemplates: async () => {
    if (get().isLoaded) return;
    const templates = await getPromptTemplates();
    set({ templates, isLoaded: true });
  },

  saveTemplate: async (name, prompt, context, defaultModel, defaultProvider) => {
    await savePromptTemplate({ name, prompt, context, defaultModel, defaultProvider });
    const templates = await getPromptTemplates();
    set({ templates });
  },

  deleteTemplate: async (id) => {
    await deletePromptTemplate(id);
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
  },
}));
