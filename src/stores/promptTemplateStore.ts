import { create } from 'zustand';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../types';
import {
  getPromptTemplates,
  savePromptTemplate,
  deletePromptTemplate,
} from '../services/promptTemplateService';

export type SaveTemplateFn = (
  name: string,
  prompt: string,
  context: PromptTemplateContext,
  workflow: PromptTemplateWorkflow,
  defaultModel?: string,
  defaultProvider?: string,
) => Promise<void>;

interface PromptTemplateState {
  templates: PromptTemplate[];
  isLoaded: boolean;
  loadTemplates: () => Promise<void>;
  saveTemplate: (
    name: string,
    prompt: string,
    context: PromptTemplateContext,
    workflow: PromptTemplateWorkflow,
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

  saveTemplate: async (name, prompt, context, workflow, defaultModel, defaultProvider) => {
    await savePromptTemplate({ name, prompt, context, workflow, defaultModel, defaultProvider });
    const templates = await getPromptTemplates();
    set({ templates });
  },

  deleteTemplate: async (id) => {
    await deletePromptTemplate(id);
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
  },
}));
