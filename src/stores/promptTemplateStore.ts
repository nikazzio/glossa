import { create } from 'zustand';
import { toast } from 'sonner';
import i18next from 'i18next';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../types';
import {
  getPromptTemplates,
  savePromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
} from '../services/promptTemplateService';

async function fetchTemplates(): Promise<PromptTemplate[]> {
  const { templates, skipped } = await getPromptTemplates();
  if (skipped.length > 0) {
    toast.error(i18next.t('pipeline.templates.skipped', { count: skipped.length }), {
      description: skipped.join(', '),
    });
  }
  return templates;
}

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
  updateTemplate: (id: string, input: Omit<PromptTemplate, 'id' | 'createdAt'>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

// Evita fetch duplicati se il componente monta/rimonta prima che la prima
// richiesta risponda: solo l'ultima chiamata avviata applica il risultato.
let loadTemplatesRequestId = 0;

export const usePromptTemplateStore = create<PromptTemplateState>((set, get) => ({
  templates: [],
  isLoaded: false,

  loadTemplates: async () => {
    if (get().isLoaded) return;
    const requestId = ++loadTemplatesRequestId;
    const templates = await fetchTemplates();
    if (requestId !== loadTemplatesRequestId) return;
    set({ templates, isLoaded: true });
  },

  saveTemplate: async (name, prompt, context, workflow, defaultModel, defaultProvider) => {
    await savePromptTemplate({ name, prompt, context, workflow, defaultModel, defaultProvider });
    const templates = await fetchTemplates();
    set({ templates });
  },

  updateTemplate: async (id, input) => {
    await updatePromptTemplate(id, input);
    const templates = await fetchTemplates();
    set({ templates });
  },

  deleteTemplate: async (id) => {
    await deletePromptTemplate(id);
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
  },
}));
