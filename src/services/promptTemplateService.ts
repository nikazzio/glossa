import { select, execute } from './dbService';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../types';
import { generateId } from '../utils';
import { logger } from '../utils/logger';

interface TemplateRow {
  id: string;
  name: string;
  prompt: string;
  context: string;
  workflow: string;
  default_model: string;
  default_provider: string;
  created_at: string;
}

const TEMPLATE_CONTEXTS: readonly PromptTemplateContext[] = ['stage', 'audit', 'brief', 'memory', 'ocr', 'system'];

function isTemplateContext(value: string): value is PromptTemplateContext {
  return (TEMPLATE_CONTEXTS as readonly string[]).includes(value);
}

function rowToTemplate(row: TemplateRow, context: PromptTemplateContext): PromptTemplate {
  const workflow: PromptTemplateWorkflow =
    row.workflow === 'transcription' ? 'transcription' : 'translation';
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    context,
    workflow,
    defaultModel: row.default_model || undefined,
    defaultProvider: row.default_provider || undefined,
    createdAt: row.created_at,
  };
}

export interface PromptTemplateList {
  templates: PromptTemplate[];
  /** Names of rows with an unknown context: excluded so one bad row cannot hide the whole list. */
  skipped: string[];
}

export async function getPromptTemplates(context?: PromptTemplateContext): Promise<PromptTemplateList> {
  const rows = context
    ? await select<TemplateRow>(
        'SELECT id, name, prompt, context, workflow, default_model, default_provider, created_at FROM prompt_templates WHERE context = $1 ORDER BY name ASC',
        [context],
      )
    : await select<TemplateRow>(
        'SELECT id, name, prompt, context, workflow, default_model, default_provider, created_at FROM prompt_templates ORDER BY name ASC',
      );
  const templates = rows.flatMap((row) => (isTemplateContext(row.context) ? [rowToTemplate(row, row.context)] : []));
  const invalid = rows.filter((row) => !isTemplateContext(row.context));
  if (invalid.length > 0) {
    logger.error('prompt_templates.unsupported_context', {
      rows: invalid.map(({ id, context: ctx }) => ({ id, context: ctx })),
    });
  }
  const skipped = invalid.map((row) => row.name);
  return { templates, skipped };
}

export async function savePromptTemplate(
  input: Omit<PromptTemplate, 'id' | 'createdAt'>,
): Promise<void> {
  const id = generateId('tpl');
  await execute(
    `INSERT INTO prompt_templates (id, name, prompt, context, workflow, default_model, default_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(name, context, workflow) DO UPDATE SET
       prompt = excluded.prompt,
       workflow = excluded.workflow,
       default_model = excluded.default_model,
       default_provider = excluded.default_provider,
       updated_at = CURRENT_TIMESTAMP`,
    [id, input.name, input.prompt, input.context, input.workflow, input.defaultModel ?? '', input.defaultProvider ?? ''],
  );
}

/** Riscrive un modello esistente. Nome, contesto e flusso restano unici: un
 *  nome già usato nello stesso contesto fa fallire la scrittura. */
export async function updatePromptTemplate(
  id: string,
  input: Omit<PromptTemplate, 'id' | 'createdAt'>,
): Promise<void> {
  await execute(
    `UPDATE prompt_templates SET name = $1, prompt = $2, context = $3, workflow = $4,
       default_model = $5, default_provider = $6, updated_at = CURRENT_TIMESTAMP
     WHERE id = $7`,
    [input.name, input.prompt, input.context, input.workflow, input.defaultModel ?? '', input.defaultProvider ?? '', id],
  );
}

export async function deletePromptTemplate(id: string): Promise<void> {
  await execute('DELETE FROM prompt_templates WHERE id = $1', [id]);
}
