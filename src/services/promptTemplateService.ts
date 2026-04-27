import { select, execute } from './dbService';
import type { PromptTemplate } from '../types';
import { generateId } from '../utils';

interface TemplateRow {
  id: string;
  name: string;
  prompt: string;
  default_model: string;
  default_provider: string;
  created_at: string;
}

function rowToTemplate(row: TemplateRow): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    defaultModel: row.default_model || undefined,
    defaultProvider: row.default_provider || undefined,
    createdAt: row.created_at,
  };
}

export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  const rows = await select<TemplateRow>(
    'SELECT id, name, prompt, default_model, default_provider, created_at FROM prompt_templates ORDER BY name ASC',
  );
  return rows.map(rowToTemplate);
}

export async function savePromptTemplate(
  input: Omit<PromptTemplate, 'id' | 'createdAt'>,
): Promise<void> {
  const id = generateId('tpl');
  await execute(
    `INSERT INTO prompt_templates (id, name, prompt, default_model, default_provider)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(name) DO UPDATE SET
       prompt = excluded.prompt,
       default_model = excluded.default_model,
       default_provider = excluded.default_provider,
       updated_at = CURRENT_TIMESTAMP`,
    [id, input.name, input.prompt, input.defaultModel ?? '', input.defaultProvider ?? ''],
  );
}

export async function deletePromptTemplate(id: string): Promise<void> {
  await execute('DELETE FROM prompt_templates WHERE id = $1', [id]);
}
