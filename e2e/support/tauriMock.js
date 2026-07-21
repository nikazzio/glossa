(() => {
  const state = {
    settings: {},
    workspaces: [],
    projects: [],
    pipelines: [],
  };

  const timestamp = '2026-01-01T00:00:00.000Z';
  const normalize = (query) => query.replace(/\s+/g, ' ').trim().toUpperCase();

  const workspaceRow = (workspace) => ({
    id: workspace.id,
    name: workspace.name,
    description: workspace.description ?? null,
    embedding_model: workspace.embeddingModel,
    memory_extractor_provider: workspace.memoryExtractorProvider,
    memory_extractor_model: workspace.memoryExtractorModel,
    memory_extractor_prompt: workspace.memoryExtractorPrompt,
    created_at: workspace.createdAt,
  });

  const projectRow = (project) => ({
    id: project.id,
    name: project.name,
    workspace_id: project.workspaceId,
    source_language: project.sourceLanguage,
    target_language: project.targetLanguage,
    source_display_text: project.sourceDisplayText,
    source_processing_text: project.sourceProcessingText,
    source_footnotes: '[]',
    document_format: 'plain',
    render_profile: 'plain-text',
    markdown_aware: 0,
    experimental_import: null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    pipeline_count: state.pipelines.filter((pipeline) => pipeline.projectId === project.id).length,
    pipeline_names: 'Default',
  });

  const pipelineRow = (pipeline) => ({
    id: pipeline.id,
    project_id: pipeline.projectId,
    name: 'Default',
    source_language: pipeline.sourceLanguage,
    target_language: pipeline.targetLanguage,
    pipeline_mode: 'standard',
    stages: '[]',
    judge_prompt: '',
    judge_model: '',
    judge_provider: '',
    use_chunking: 1,
    words_per_chunk: 0,
    source_display_text: null,
    source_processing_text: null,
    source_footnotes: '[]',
    review_provider_options: null,
    persona: null,
    custom_source_language: null,
    custom_target_language: null,
    blob_budget_tokens: null,
    blob_overlap: null,
    coherence_prompt: null,
    few_shot_examples: '[]',
    use_phrase_memory: 0,
    auto_search_phrase_memory: null,
    phrase_memory_similarity_threshold: null,
    phrase_memory_max_results: null,
    run_status: 'idle',
    last_run_config: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const select = (query, values = []) => {
    const sql = normalize(query);

    if (sql.includes('FROM SQLITE_MASTER')) return [{ count: 0 }];
    if (sql.startsWith('PRAGMA')) return [];
    if (sql.includes('FROM APP_SETTINGS WHERE KEY = $1')) {
      const value = state.settings[values[0]];
      return value === undefined ? [] : [{ value }];
    }
    if (sql.includes('FROM WORKSPACES')) return state.workspaces.map(workspaceRow);
    if (sql.includes('FROM PROJECTS WHERE ID = $1')) {
      const project = state.projects.find((candidate) => candidate.id === values[0]);
      return project ? [projectRow(project)] : [];
    }
    if (sql.includes('FROM PROJECTS P')) {
      const projects = sql.includes('WHERE P.WORKSPACE_ID = $1')
        ? state.projects.filter((project) => project.workspaceId === values[0])
        : state.projects;
      return projects.map(projectRow);
    }
    if (sql.includes('FROM PIPELINES WHERE PROJECT_ID = $1')) {
      return state.pipelines
        .filter((pipeline) => pipeline.projectId === values[0])
        .map(pipelineRow);
    }
    if (sql.includes('FROM PIPELINES WHERE ID = $1')) {
      const pipeline = state.pipelines.find((candidate) => candidate.id === values[0]);
      return pipeline ? [pipelineRow(pipeline)] : [];
    }
    if (sql.includes('COUNT(*)')) return [{ count: 0, total: 0, completed: 0 }];
    return [];
  };

  const applyStatement = ({ query, params = [] }) => {
    const sql = normalize(query);

    if (sql.startsWith('INSERT INTO WORKSPACES')) {
      state.workspaces.push({
        id: params[0],
        name: params[1],
        description: params[2] ?? undefined,
        embeddingModel: params[3],
        memoryExtractorProvider: params[4],
        memoryExtractorModel: params[5],
        memoryExtractorPrompt: params[6],
        createdAt: params[7],
      });
      return;
    }
    if (sql.startsWith('INSERT INTO PROJECTS')) {
      state.projects.push({
        id: params[0],
        name: params[1],
        sourceLanguage: params[2],
        targetLanguage: params[3],
        workspaceId: params[4],
        sourceDisplayText: '',
        sourceProcessingText: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return;
    }
    if (sql.startsWith('INSERT INTO PIPELINES')) {
      state.pipelines.push({
        id: params[0],
        projectId: params[1],
        sourceLanguage: params[2],
        targetLanguage: params[3],
      });
      return;
    }
    if (sql.startsWith('INSERT INTO APP_SETTINGS')) {
      state.settings[params[0]] = params[1];
      return;
    }
    if (sql.startsWith('UPDATE PROJECTS SET SOURCE_DISPLAY_TEXT')) {
      const project = state.projects.find((candidate) => candidate.id === params[9]);
      if (project) {
        project.sourceDisplayText = params[0];
        project.sourceProcessingText = params[1];
        project.updatedAt = timestamp;
      }
    }
  };

  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 1,
    unregisterCallback: () => {},
    invoke: async (command, args = {}) => {
      if (command === 'plugin:sql|load') return args.db;
      if (command === 'plugin:sql|select') return select(args.query, args.values);
      if (command === 'plugin:sql|execute') return [0, 0];
      if (command === 'execute_transaction') {
        args.statements.forEach(applyStatement);
        return null;
      }
      if (command === 'get_api_key_status') return false;
      if (command.startsWith('plugin:log|')) throw new Error('Logging is unavailable in browser smoke tests');
      return null;
    },
  };
})();
