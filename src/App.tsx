import React, { useState, useCallback } from 'react';
import { 
  Languages, 
  Plus, 
  Trash2, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Book,
  Settings2,
  Sparkles,
  Loader2,
  ChevronRight,
  Edit3,
  Search,
  ArrowRight,
  ArrowRightLeft,
  Settings,
  Layers,
  ShieldCheck,
  Key,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCcw,
  Zap,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { llmService } from './services/llmService.ts';
import { 
  GlossaryEntry, 
  TranslationChunk, 
  PipelineConfig, 
  PipelineResult, 
  JudgeResult,
  PipelineStageConfig,
  ModelProvider
} from './types.ts';

const DEFAULT_STAGES: PipelineStageConfig[] = [
  { id: 'stg-draft', name: 'Initial Pass', prompt: 'Perform an initial translation pass. Focus on literal meaning and linguistic accuracy.', model: 'gemini-3-flash-preview', provider: 'gemini', enabled: true },
  { id: 'stg-style', name: 'Refinement', prompt: 'Rewrite the translation to sound more natural, fluent, and professional. Match the intended tone.', model: 'gemini-3-flash-preview', provider: 'gemini', enabled: true }
];

const DEFAULT_JUDGE_PROMPT = "Audit the final translation for technical accuracy, glossary adherence, and natural tone.";

const MODEL_OPTIONS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash-lite-preview'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-haiku-latest'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner']
};

const LANGUAGES = [
  "English",
  "Italian",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Japanese",
  "Chinese",
  "Korean",
  "Russian"
];

export default function App() {
  const [inputText, setInputText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<PipelineConfig>({
    sourceLanguage: "English",
    targetLanguage: "Italian",
    stages: DEFAULT_STAGES,
    judgePrompt: DEFAULT_JUDGE_PROMPT,
    judgeModel: "gemini-3-flash-preview",
    judgeProvider: "gemini",
    glossary: [],
    useChunking: true
  });
  const [chunks, setChunks] = useState<TranslationChunk[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const generateChunks = useCallback(() => {
    if (!inputText.trim()) return;
    const texts = config.useChunking !== false 
      ? inputText.split('\n\n').filter(p => p.trim()) 
      : [inputText.trim()].filter(Boolean);

    const items = texts.map((text, i) => ({
      id: `chunk-${i}`,
      originalText: text,
      stageResults: {},
      judgeResult: { content: "", status: 'idle', score: 0, issues: [] } as JudgeResult,
      currentDraft: ""
    }));
    setChunks(items);
  }, [inputText, config.useChunking]);

  const updateChunkDraft = (chunkId: string, draft: string) => {
    setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, currentDraft: draft } : c));
  };

  const updateChunkStage = (chunkId: string, stageId: string, result: PipelineResult) => {
    setChunks(prev => prev.map(c => c.id === chunkId ? {
      ...c,
      stageResults: { ...c.stageResults, [stageId]: result }
    } : c));
  };

  const updateChunkJudge = (chunkId: string, result: JudgeResult) => {
    setChunks(prev => prev.map(c => c.id === chunkId ? {
      ...c,
      judgeResult: result
    } : c));
  };

  const runPipeline = async () => {
    if (chunks.length === 0) return;
    setIsProcessing(true);
    
    // Clear previous results
    setChunks(prev => prev.map(c => ({
        ...c,
        stageResults: {},
        judgeResult: { content: "", status: 'idle', score: 0, issues: [] } as JudgeResult,
        currentDraft: "" // Reset draft
    })));

    // To ensure UI gets the most up to date drafts in one pass
    const processedChunks: TranslationChunk[] = [...chunks];

    for (let cIdx = 0; cIdx < processedChunks.length; cIdx++) {
      const chunk = processedChunks[cIdx];
      let lastResult = "";

      // Execute each enabled stage
      for (const stage of config.stages) {
        if (!stage.enabled) continue;

        updateChunkStage(chunk.id, stage.id, { content: "", status: 'processing' });
        try {
          const result = await llmService.runStage(chunk.originalText, stage, config, lastResult);
          lastResult = result;
          updateChunkStage(chunk.id, stage.id, { content: result, status: 'completed' });
        } catch (error: any) {
          updateChunkStage(chunk.id, stage.id, { content: "", status: 'error', error: error.message });
          break;
        }
      }

      // Update current draft state before judging
      if (lastResult) {
        updateChunkDraft(chunk.id, lastResult);
      }

      // Final Audit (Judge)
      if (lastResult) {
        updateChunkJudge(chunk.id, { content: "", status: 'processing', score: 0, issues: [] });
        try {
            const judgeData = await llmService.judgeTranslation(chunk.originalText, lastResult, config);
            updateChunkJudge(chunk.id, { ...judgeData, content: lastResult, status: 'completed' });
        } catch (error: any) {
            updateChunkJudge(chunk.id, { content: lastResult, status: 'error', score: 0, issues: [], error: error.message });
        }
      }
    }
    setIsProcessing(false);
  };

  const runAuditOnly = async () => {
    if (chunks.length === 0) return;
    setIsProcessing(true);

    for (const chunk of chunks) {
      const textToAudit = chunk.currentDraft;
      if (!textToAudit) continue;

      updateChunkJudge(chunk.id, { content: "", status: 'processing', score: 0, issues: [] });
      try {
          const judgeData = await llmService.judgeTranslation(chunk.originalText, textToAudit, config);
          updateChunkJudge(chunk.id, { ...judgeData, content: textToAudit, status: 'completed' });
      } catch (error: any) {
          updateChunkJudge(chunk.id, { content: textToAudit, status: 'error', score: 0, issues: [], error: error.message });
      }
    }
    setIsProcessing(false);
  };

  const addStage = () => {
    const newStage: PipelineStageConfig = {
      id: `stg-${Date.now()}`,
      name: `New Stage`,
      prompt: "",
      model: "gemini-3-flash-preview",
      provider: "gemini",
      enabled: true
    };
    setConfig(prev => ({ ...prev, stages: [...prev.stages, newStage] }));
  };

  const removeStage = (id: string) => {
    setConfig(prev => ({ ...prev, stages: prev.stages.filter(s => s.id !== id) }));
  };

  const updateStage = (id: string, updates: Partial<PipelineStageConfig>) => {
    setConfig(prev => ({
      ...prev,
      stages: prev.stages.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  return (
    <div className="min-h-screen bg-editorial-bg text-editorial-ink font-sans">
      {/* Header */}
      <header className="px-10 py-10 border-b border-editorial-border bg-editorial-bg flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="brand font-display italic text-4xl tracking-tight">
          Glossa // Pipeline
        </div>
        <div className="flex items-center gap-6">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-editorial-muted">
            Multi-LLM Pipeline v1.0
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 border border-editorial-border hover:bg-editorial-ink hover:text-white transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-12 min-h-[calc(100vh-140px)]">
        {/* Panel 1: Config */}
        <section className="col-span-1 md:col-span-3 border-r border-editorial-border p-8 flex flex-col gap-8 bg-editorial-bg/50 overflow-y-auto max-h-[calc(100vh-140px)] custom-scrollbar">
          <div className="space-y-10">
            <div>
              <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-8 inline-block">Global Setup</h2>
              <div className="space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Language Pair</label>
                <div className="flex items-center gap-3">
                  <select 
                    value={config.sourceLanguage}
                    onChange={e => setConfig(prev => ({ ...prev, sourceLanguage: e.target.value }))}
                    className="w-full bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-editorial-ink/10 appearance-none"
                  >
                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                  </select>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, sourceLanguage: prev.targetLanguage, targetLanguage: prev.sourceLanguage }))}
                    className="text-editorial-muted hover:text-editorial-ink transition-colors hover:scale-110 shrink-0"
                    title="Swap Languages"
                  >
                    <ArrowRightLeft size={14} />
                  </button>
                  <select 
                    value={config.targetLanguage}
                    onChange={e => setConfig(prev => ({ ...prev, targetLanguage: e.target.value }))}
                    className="w-full bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-editorial-ink/10 appearance-none"
                  >
                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                  </select>
                </div>
                
                <label className="flex items-center gap-2 mt-4 cursor-pointer w-max group">
                  <input 
                    type="checkbox" 
                    checked={config.useChunking !== false} 
                    onChange={e => setConfig(prev => ({...prev, useChunking: e.target.checked}))} 
                    className="accent-editorial-ink w-3 h-3" 
                  />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-muted group-hover:text-editorial-ink transition-colors">
                    Auto-Segment (Paragraphs)
                  </span>
                </label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-8">
                <h2 className="font-display text-sm uppercase tracking-wider">Stages</h2>
                <button onClick={addStage} className="text-editorial-accent hover:scale-110 transition-transform"><Plus size={18} /></button>
              </div>
              
              <div className="space-y-6">
                {config.stages.map((stage, idx) => (
                  <StageCard 
                    key={stage.id} 
                    stage={stage} 
                    index={idx}
                    onUpdate={(u) => updateStage(stage.id, u)}
                    onRemove={() => removeStage(stage.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-8 inline-block">Audit Guard</h2>
              <div className="space-y-4">
                <div className="flex gap-2">
                    <select 
                      value={config.judgeProvider}
                      onChange={e => setConfig(prev => ({ ...prev, judgeProvider: e.target.value as ModelProvider, judgeModel: MODEL_OPTIONS[e.target.value as ModelProvider][0] }))}
                      className="bg-editorial-textbox border-none px-2 py-1 text-[10px] font-bold uppercase outline-none"
                    >
                      {Object.keys(MODEL_OPTIONS).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select 
                      value={config.judgeModel}
                      onChange={e => setConfig(prev => ({ ...prev, judgeModel: e.target.value }))}
                      className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
                    >
                      {MODEL_OPTIONS[config.judgeProvider].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                  <textarea 
                  value={config.judgePrompt}
                  onChange={e => setConfig(prev => ({ ...prev, judgePrompt: e.target.value }))}
                  placeholder="Audit instructions..."
                  rows={6}
                  className="w-full bg-editorial-textbox border-none p-4 text-xs font-mono outline-none leading-relaxed resize-y"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Keyword Registry</label>
                <Plus cursor="pointer" size={14} className="text-editorial-accent" onClick={() => setConfig(prev => ({ ...prev, glossary: [...prev.glossary, { term: '', translation: '' }] }))} />
              </div>
              <div className="space-y-2">
                {config.glossary.map((g, i) => (
                  <div key={i} className="flex gap-2 items-center group">
                    <input 
                      value={g.term}
                      onChange={e => setConfig(prev => {
                        const n = [...prev.glossary];
                        n[i] = { ...n[i], term: e.target.value };
                        return { ...prev, glossary: n };
                      })}
                      className="w-full bg-editorial-textbox border-none p-2 text-[10px] font-mono outline-none"
                      placeholder="Source"
                    />
                    <ArrowRight size={10} className="shrink-0 opacity-20" />
                    <input 
                      value={g.translation}
                      onChange={e => setConfig(prev => {
                        const n = [...prev.glossary];
                        n[i] = { ...n[i], translation: e.target.value };
                        return { ...prev, glossary: n };
                      })}
                      className="w-full bg-editorial-textbox border-none p-2 text-[10px] font-mono outline-none"
                      placeholder="Target"
                    />
                    <X size={10} className="cursor-pointer opacity-0 group-hover:opacity-100 text-red-500" onClick={() => setConfig(prev => ({ ...prev, glossary: prev.glossary.filter((_, idx) => idx !== i) }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-10 flex flex-col gap-3 shrink-0">
            <button 
              onClick={runPipeline}
              disabled={isProcessing || chunks.length === 0}
              className="bg-editorial-ink text-white px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-black/90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={14} /> 
                  Executing...
                </span>
              ) : <span className="flex items-center justify-center gap-2"><Play size={14} fill="currentColor" /> Begin Pipeline</span>}
            </button>
            <button 
              onClick={runAuditOnly}
              disabled={isProcessing || chunks.length === 0}
              className="bg-transparent border border-editorial-ink text-editorial-ink px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Run Audit Only
            </button>
          </div>
        </section>

        {/* Panel 2: Stream */}
        <section className="col-span-1 md:col-span-6 bg-white p-8 overflow-y-auto max-h-[calc(100vh-140px)] border-r border-editorial-border custom-scrollbar">
          <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-10">
            <h2 className="font-display text-sm uppercase tracking-wider inline-block">Production Stream</h2>
            {chunks.length > 0 && (
              <button onClick={() => setChunks([])} className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-red-500 transition-colors flex items-center gap-1">
                 <Trash2 size={12} /> Clear Stream
              </button>
            )}
          </div>
          
          <div className="space-y-16">
            {!chunks.length && (
              <div className="space-y-8 max-w-2xl mx-auto py-12">
                <div className="space-y-4">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Input Content</label>
                  <textarea 
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Paste source material here..."
                    className="w-full bg-editorial-textbox border-none p-8 text-sm font-mono outline-none leading-relaxed resize-none min-h-[400px]"
                  />
                </div>
                <button 
                  onClick={generateChunks}
                  className="w-full bg-editorial-ink text-white px-6 py-5 text-[11px] font-bold uppercase tracking-[3px] hover:shadow-xl transition-all"
                >
                  Stage Content to Stream
                </button>
              </div>
            )}

            {chunks.map((chunk, idx) => (
              <div key={chunk.id} className="space-y-8 border-b border-editorial-border pb-16 last:border-0 last:pb-0 group">
                <div className="flex items-center justify-between">
                  <span className="font-display italic text-2xl text-editorial-accent tracking-tighter">Unit {indexPad(idx + 1)}</span>
                  <div className="flex gap-4">
                    {config.stages.filter(s => s.enabled).map((s, si) => (
                        <StatusIndicator key={s.id} status={chunk.stageResults[s.id]?.status || 'idle'} label={indexPad(si + 1)} />
                    ))}
                    <StatusIndicator status={chunk.judgeResult.status} label="Audit" />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-editorial-muted font-mono leading-relaxed opacity-50 mb-6 italic">
                    Original Source: "{chunk.originalText.slice(0, 150)}{chunk.originalText.length > 150 ? '...' : ''}"
                  </p>
                  
                  {config.stages.filter(s => s.enabled).map((stage, sIdx) => {
                      const result = chunk.stageResults[stage.id];
                      if (!result || result.status === 'idle') return null;

                      return (
                          <div key={stage.id} className="relative border border-editorial-border p-6 bg-editorial-bg/10 animate-in fade-in slide-in-from-left-2 duration-300">
                            <span className="absolute -top-3 left-6 bg-white border border-editorial-border px-2 font-display italic text-[10px]">{stage.name}</span>
                            <div className="text-sm leading-relaxed overflow-hidden">
                                {result.status === 'processing' ? <ProcessingLine /> : (
                                    <div className="text-editorial-ink">
                                        {result.content}
                                    </div>
                                )}
                            </div>
                          </div>
                      );
                  })}
                  
                  <div className="space-y-3 mt-8">
                    <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Candidate Translation</label>
                        <CopyButton text={chunk.currentDraft || ""} />
                    </div>
                    <textarea
                       value={chunk.currentDraft || ""}
                       onChange={(e) => updateChunkDraft(chunk.id, e.target.value)}
                       className="w-full bg-editorial-bg/50 border border-editorial-border p-4 text-sm font-sans outline-none focus:ring-1 focus:ring-editorial-ink/10 resize-y min-h-[100px] leading-relaxed transition-all"
                       placeholder="Output will appear here. Edit manually before auditing..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Panel 3: LLM Judge */}
        <section className="col-span-1 md:col-span-3 p-8 bg-editorial-bg overflow-y-auto max-h-[calc(100vh-140px)] flex flex-col gap-10 custom-scrollbar">
          <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-4 inline-block">Audit Logs</h2>
          
          <div className="flex flex-col gap-12 flex-1">
            {chunks.length > 0 && chunks.some(c => c.judgeResult.status === 'completed') ? (
              <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-1">
                  <div className="text-7xl font-display text-center tracking-tighter">
                    {calculateCompositeScore(chunks)}
                    <span className="text-base text-editorial-muted ml-1 font-sans">/100</span>
                  </div>
                  <div className="text-[8px] text-center uppercase font-bold tracking-[4px] text-editorial-muted">Composite Index</div>
                </div>

                <div className="space-y-4">
                  <label className="block text-[9px] font-bold uppercase tracking-[2px] text-editorial-muted border-b border-editorial-border pb-1">Anomalies Detected</label>
                  <ul className="divide-y divide-editorial-border/50">
                    {chunks.flatMap(c => c.judgeResult.issues).map((issue, i) => (
                      <li key={i} className="py-4 hover:bg-white/30 px-2 -mx-2 transition-colors rounded-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                              issue.severity === 'high' ? 'bg-red-500 text-white' : 'bg-editorial-ink text-white'
                          }`}>
                            {issue.type}
                          </span>
                        </div>
                        <span className="font-display italic text-sm leading-snug block text-editorial-ink">
                          "{issue.description}"
                        </span>
                        {issue.suggestedFix && (
                          <div className="mt-2 text-[10px] font-mono text-editorial-muted bg-white p-2 rounded-sm border-l-2 border-editorial-accent">
                            FIX: {issue.suggestedFix}
                          </div>
                        )}
                      </li>
                    ))}
                    {chunks.every(c => c.judgeResult.status === 'completed' && c.judgeResult.issues.length === 0) && (
                      <div className="text-center py-20 opacity-20 italic font-display flex flex-col items-center gap-4">
                        <ShieldCheck size={40} strokeWidth={1} />
                        <span className="text-[10px] uppercase tracking-widest">Pipeline Audit Clear</span>
                      </div>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-10 font-display text-center px-6">
                 <ShieldCheck size={48} strokeWidth={1} />
                <span className="text-[10px] uppercase tracking-[4px] font-bold mt-4">No Audit Record</span>
              </div>
            )}
          </div>

          <div className="mt-auto space-y-4">
             <button 
                onClick={runAuditOnly}
                disabled={isProcessing || chunks.length === 0}
                className="w-full bg-transparent border border-editorial-ink text-editorial-ink px-4 py-4 text-[11px] font-bold uppercase tracking-[3px] hover:bg-editorial-ink hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm active:translate-y-px"
              >
                <RefreshCcw size={14} className={isProcessing ? "animate-spin" : ""} /> Re-Evaluate Drafts
              </button>
             <button 
                onClick={() => setChunks([])}
                className="w-full border border-editorial-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center gap-2"
              >
                Clear Stream
              </button>
          </div>
        </section>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
          {showSettings && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
                    onClick={() => setShowSettings(false)}
                  />
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="relative bg-editorial-bg w-full max-w-2xl max-h-[80vh] overflow-y-auto p-12 custom-scrollbar shadow-2xl border border-editorial-border"
                  >
                      <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 text-editorial-muted hover:text-editorial-ink"><X size={24} /></button>
                      <h2 className="font-display text-3xl italic tracking-tight mb-12">Global Config / Secrets</h2>

                      <div className="space-y-12">
                          <div className="space-y-4">
                              <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Provider Configuration</label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <ApiKeyInput label="Gemini (Native)" envKey="GEMINI_API_KEY" />
                                  <ApiKeyInput label="OpenAI" envKey="OPENAI_API_KEY" />
                                  <ApiKeyInput label="Anthropic" envKey="ANTHROPIC_API_KEY" />
                                  <ApiKeyInput label="DeepSeek" envKey="DEEPSEEK_API_KEY" />
                              </div>
                          </div>

                          <div className="p-8 border border-editorial-border bg-editorial-textbox/20 flex gap-4 items-start">
                              <AlertCircle size={20} className="text-editorial-accent shrink-0" />
                              <div className="space-y-2">
                                  <h4 className="text-[11px] font-bold uppercase tracking-widest">Security Advisory</h4>
                                  <p className="text-xs text-editorial-muted leading-relaxed">
                                      API keys are retrieved from environment variables for production runs. Defining them here locally (via VITE_ prefix) overrides defaults for this session.
                                      Always prefer the project's <span className="text-editorial-ink font-bold">Secrets panel</span> for sensitive integration.
                                  </p>
                              </div>
                          </div>

                          <div className="pt-8 border-t border-editorial-border flex justify-end">
                              <button 
                                onClick={() => setShowSettings(false)}
                                className="bg-editorial-ink text-white px-8 py-4 text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-90 active:scale-95"
                              >
                                  Save & Close
                              </button>
                          </div>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>
    </div>
  );
}

function StageCard({ stage, index, onUpdate, onRemove }: { 
    stage: PipelineStageConfig, 
    index: number, 
    onUpdate: (u: Partial<PipelineStageConfig>) => void, 
    onRemove: () => void,
    key?: React.Key
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className={`relative border border-editorial-border p-5 bg-white transition-all ${!stage.enabled ? 'grayscale opacity-40' : 'shadow-sm'}`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="font-display italic text-lg text-editorial-accent">#{index + 1}</span>
                    <input 
                      value={stage.name}
                      onChange={e => onUpdate({ name: e.target.value })}
                      className="bg-transparent border-none p-0 font-display text-sm focus:outline-none w-32 border-b border-transparent focus:border-editorial-ink/20"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => onUpdate({ enabled: !stage.enabled })} className="text-editorial-muted">
                        {stage.enabled ? <ShieldCheck size={14} className="text-editorial-ink" /> : <div className="w-3.5 h-3.5 border-2 border-editorial-muted rounded-sm" />}
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="text-editorial-muted">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button onClick={onRemove} className="text-editorial-muted hover:text-red-500 overflow-hidden"><Trash2 size={14} /></button>
                </div>
            </div>

            {isExpanded && (
                <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">
                    <div className="flex gap-2">
                        <select 
                          value={stage.provider}
                          onChange={e => onUpdate({ provider: e.target.value as ModelProvider, model: MODEL_OPTIONS[e.target.value as ModelProvider][0] })}
                          className="bg-editorial-textbox border-none px-2 py-1 text-[10px] font-bold uppercase outline-none"
                        >
                          {Object.keys(MODEL_OPTIONS).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select 
                          value={stage.model}
                          onChange={e => onUpdate({ model: e.target.value })}
                          className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
                        >
                          {MODEL_OPTIONS[stage.provider].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <textarea 
                      value={stage.prompt}
                      onChange={e => onUpdate({ prompt: e.target.value })}
                      placeholder="Stage specific prompt..."
                      rows={6}
                      className="w-full bg-editorial-textbox border-none p-3 text-[11px] font-mono outline-none leading-relaxed resize-y"
                    />
                </div>
            )}
        </div>
    );
}

function ApiKeyInput({ label, envKey }: { label: string, envKey: string }) {
    const isSet = process.env[envKey] || (import.meta as any).env[`VITE_${envKey}`];
    return (
        <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase text-editorial-muted">{label}</span>
            <div className="flex items-center gap-3 bg-editorial-textbox px-3 py-2">
                <Key size={14} className={isSet ? "text-editorial-accent" : "text-editorial-muted opacity-20"} />
                <span className="flex-1 text-[10px] font-mono truncate">
                    {isSet ? "••••••••••••••••" : "Not configured"}
                </span>
                {isSet && <CheckCircle2 size={12} className="text-editorial-ink" />}
            </div>
        </div>
    );
}

function StatusIndicator({ status, label }: { status: string; label: string; key?: React.Key }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${
        status === 'completed' ? 'bg-editorial-ink' : 
        status === 'processing' ? 'bg-editorial-accent animate-pulse' : 
        status === 'error' ? 'bg-red-500' :
        'bg-editorial-border'
      }`} />
      <span className={`text-[8px] font-bold uppercase tracking-widest ${
        status === 'completed' ? 'text-editorial-ink' : 
        status === 'processing' ? 'text-editorial-accent' : 
        'text-editorial-muted opacity-40'
      }`}>{label}</span>
    </div>
  );
}

function ProcessingLine() {
  return (
    <div className="space-y-2 py-2">
      <div className="h-0.5 bg-editorial-border w-full animate-pulse"></div>
      <div className="h-0.5 bg-editorial-border w-4/5 animate-pulse delay-75"></div>
      <div className="h-0.5 bg-editorial-border w-1/2 animate-pulse delay-150"></div>
    </div>
  );
}

function calculateCompositeScore(chunks: TranslationChunk[]) {
  const completed = chunks.filter(c => c.judgeResult.status === 'completed');
  if (completed.length === 0) return 0;
  const avg = completed.reduce((acc, c) => acc + c.judgeResult.score, 0) / completed.length;
  return Math.round(avg * 10);
}

function indexPad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button 
      onClick={handleCopy} 
      className="text-editorial-muted hover:text-editorial-ink transition-colors flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest"
    >
       {copied ? <Check size={12} /> : <Copy size={12} />}
       {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
