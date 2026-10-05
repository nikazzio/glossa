import { ArrowUpRight, Braces, Settings2, ToggleLeft, ToggleRight, FileText, Languages, Link2, MessageSquare, Network, ScrollText, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, PipelineStageConfig, PromptInfo, PromptPart, StageRole, SystemTextInfo, TranslationChunk } from '../../types';
import { llmService } from '../../services/llmService';
import { deeplService } from '../../services/deeplService';
import { getDeeplOptions } from '../../pipeline/deeplConfig';
import { ChoiceDots, Hint, IconButton, PanelSection, SectionLabel, TabStrip, type ChoiceDotsOption, type TabStripItem } from '../ui';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { AUDIT_PREVIEW_ID, COHERENCE_PREVIEW_ID, useChunkPromptPreview } from '../../hooks/useChunkPromptPreview';
import { PromptMessage } from './PromptCard';
import { CONDITIONAL_AT_RUN_TIME, PHASE_PARTS, SWITCHABLE_PARTS, isPartOff, withPartSwitch, type PartPlace, type PartSpec, type PreviewPhase } from './promptParts';
import { SystemTextCard } from './SystemTextCard';
import { CommandRule } from '../ui/CommandRule';
import type { ConfigSection } from './PipelineConfig';

interface PromptPreviewTabProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  /** Apre la scheda dove si modifica il contenuto di un pezzo. */
  onOpenSection: (section: ConfigSection) => void;
  disabledReason?: string;
}

const PLACE_SECTION: Record<PartPlace, ConfigSection> = {
  general: 'settings',
  stages: 'translation',
  quality: 'audit',
  glossary: 'glossary',
  memory: 'memory',
};

/** Shared editing context passed down to every part card. */
interface EditContext {
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  onOpenSection: (section: ConfigSection) => void;
  systemTexts: Map<string, SystemTextInfo>;
  disabledReason?: string;
}

const STAGE_ICON: Record<StageRole, typeof Languages> = {
  'deepl-translation': Network,
  translation: Languages,
  refine: Wand2,
  format: FileText,
};

const AUDIT_ID = AUDIT_PREVIEW_ID;
const COHERENCE_ID = COHERENCE_PREVIEW_ID;

type PreviewMode = 'structure' | 'chunk';

/** Placeholders stand for what only exists at run time, so the preview shows where it goes. */
function requestPreview(config: PipelineConfig, phase: PreviewPhase, stage?: PipelineStageConfig): Promise<PromptInfo> {
  if (phase === 'audit') return llmService.previewJudgePrompt('{{SOURCE_CHUNK_TEXT}}', '{{TRANSLATION}}', config);
  if (phase === 'coherence') {
    return llmService.previewCoherencePrompt({
      original: '{{SOURCE_CHUNK_TEXT}}',
      translation: '{{TRANSLATION}}',
      blobContext: '{{TRANSLATED_NEIGHBOUR_CHUNKS}}',
      currentChunkId: '{{CURRENT_CHUNK_ID}}',
    }, config);
  }
  if (!stage) return Promise.reject(new Error('missing stage'));
  const isFormat = phase === 'format';
  return llmService.previewStagePrompt(
    isFormat ? '{{TEXT_TO_FORMAT}}' : '{{SOURCE_CHUNK_TEXT}}',
    config.usePhraseMemory && !isFormat ? { ...stage, prompt: `${stage.prompt}\n\n{{PHRASE_MEMORY_REFERENCES}}` } : stage,
    { ...config, ...(!isFormat ? { blobContext: '{{NEIGHBOUR_CHUNKS}}', blobCurrentChunkId: '{{CURRENT_CHUNK_ID}}' } : {}) },
    phase === 'refine' ? '{{PREVIOUS_STAGE_RESULT}}' : undefined,
  );
}

function kindLabel(spec: PartSpec, t: (key: string, options?: Record<string, string>) => string): string {
  return spec.place
    ? t(`pipeline.promptParts.kind.${spec.kind}At`, { place: t(`pipeline.promptParts.place.${spec.place}`) })
    : t(`pipeline.promptParts.kind.${spec.kind}`);
}

function PartCard({ spec, part, config, edit, phase }: { spec: PartSpec; part?: PromptPart; config: PipelineConfig; edit?: EditContext; phase: PreviewPhase }) {
  const { t } = useTranslation();
  const title = t(`pipeline.promptParts.${spec.id}.title`);
  const runtimeCondition = CONDITIONAL_AT_RUN_TIME[spec.id];
  const hint = [
    t(`pipeline.promptParts.${spec.id}.hint`),
    runtimeCondition ? t(`pipeline.promptParts.reason.${runtimeCondition}`) : '',
  ].filter(Boolean).join(' — ');
  const place = spec.place;
  const openPlace = edit && place
    ? <IconButton size="sm" title={t('pipeline.promptParts.openPlace', { place: t(`pipeline.promptParts.place.${place}`) })}
        onClick={() => edit.onOpenSection(PLACE_SECTION[place])}><ArrowUpRight size={14} /></IconButton>
    : null;
  // Interruttore del pezzo: solo per i facoltativi, e solo dove si può modificare.
  const switchable = Boolean(edit) && SWITCHABLE_PARTS.has(spec.id);
  const off = switchable && isPartOff(config, phase, spec.id);
  const switchButton = edit && switchable
    ? <IconButton size="sm" ariaPressed={!off} disabled={Boolean(edit.disabledReason)}
        title={edit.disabledReason
          ? t('transcription.commandBlocked', { command: t(off ? 'pipeline.promptParts.switchOn' : 'pipeline.promptParts.switchOff'), reason: edit.disabledReason })
          : t(off ? 'pipeline.promptParts.switchOn' : 'pipeline.promptParts.switchOff')}
        onClick={() => edit.setConfig((prev) => withPartSwitch(prev, phase, spec.id, off))}>
        {off ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
      </IconButton>
    : null;
  // Il tipo è un'icona muted con la spiegazione nel suggerimento; i comandi stanno dopo un filetto.
  const KindIcon = spec.kind === 'auto' ? Braces : Settings2;
  const kindIcon = <Hint label={kindLabel(spec, t)}><KindIcon size={13} className="text-editorial-muted" aria-hidden="true" /></Hint>;
  const commands = openPlace || switchButton ? <>{openPlace}{switchButton}</> : null;
  if (part && !off) {
    const info = edit && part.textId ? edit.systemTexts.get(part.textId) : undefined;
    // Con la freccia il contenuto si modifica altrove: qui niente lucchetto.
    if (edit && part.textId && info && spec.kind === 'system') {
      return <SystemTextCard part={part} textId={part.textId} info={info} title={title} hint={hint} kind={kindIcon} commands={commands}
        config={config} setConfig={edit.setConfig} disabledReason={edit.disabledReason} />;
    }
    return <PromptMessage label={title} hint={hint} text={part.text.trim()}
      metadata={<>{kindIcon}{commands && <><CommandRule />{commands}</>}<CommandRule /></>} />;
  }
  const reason = off ? 'switchedOff' : spec.absentReason?.(config);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-rule px-4 py-2 text-sm text-editorial-muted">
      <Hint label={`${title} — ${hint}`}><span className="font-display italic">{title}</span></Hint>
      <span>— {t(`pipeline.promptParts.reason.${reason ?? 'notInThisRequest'}`)}</span>
      {kindIcon}
      {openPlace}
      {off && switchButton}
    </div>
  );
}

/** Stessi pezzi, riempiti con i dati veri del frammento aperto nello Studio: si vedono solo quelli che partono. */
function ChunkParts({ config, phase, previewId, chunk }: {
  config: PipelineConfig;
  phase: PreviewPhase | null;
  previewId: string;
  chunk: TranslationChunk;
}) {
  const { t } = useTranslation();
  const { preview, error, isDeeplStage, build } = useChunkPromptPreview(chunk);
  const isReview = previewId === AUDIT_ID || previewId === COHERENCE_ID;
  const reviewBlocked = isReview && !chunk.translationProcessingText?.trim();

  useEffect(() => {
    if (!reviewBlocked) void build(previewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- build() legge lo stato corrente: si rifà al cambio di fase, frammento o configurazione
  }, [previewId, chunk.id, chunk.translationProcessingText, config, reviewBlocked]);

  if (reviewBlocked) return <p className="text-sm text-editorial-muted">{t('promptPreview.translationRequired')}</p>;
  if (error) return <p role="alert" className="text-sm text-editorial-danger">{error}</p>;
  if (!preview) return <p className="text-sm text-editorial-muted">{t('common.loading')}</p>;
  if (isDeeplStage || !phase) {
    return <PromptMessage label={t('pipeline.promptParts.deepl-request.title')} hint={t('pipeline.promptParts.deepl-request.hint')} text={preview.userPrompt}
      metadata={<><Hint label={t('pipeline.promptParts.kind.auto')}><Braces size={13} className="text-editorial-muted" aria-hidden="true" /></Hint><CommandRule /></>} />;
  }
  const specs = new Map(PHASE_PARTS[phase].map((spec) => [`${spec.message}:${spec.id}`, spec]));
  const group = (message: 'system' | 'user') => (preview.parts ?? [])
    .filter((part) => part.message === message)
    .map((part) => {
      const spec: PartSpec = specs.get(`${message}:${part.id}`) ?? { id: part.id, message, kind: 'auto' };
      return <PartCard key={`${message}-${part.id}`} spec={spec} part={part} config={config} phase={phase} />;
    });
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel icon={FileText} label={t('pipeline.promptParts.systemMessage')} hint={t('pipeline.promptParts.systemMessageHint')} />
        {group('system')}
      </div>
      <div className="space-y-3">
        <SectionLabel icon={MessageSquare} label={t('pipeline.promptParts.userMessage')} hint={t('pipeline.promptParts.userMessageHint')} />
        {group('user')}
      </div>
    </div>
  );
}

function PhaseParts({ config, phase, stage, edit }: { config: PipelineConfig; phase: PreviewPhase; stage?: PipelineStageConfig; edit: EditContext }) {
  const { t } = useTranslation();
  const [parts, setParts] = useState<PromptPart[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    // L'elenco precedente resta finché arriva il nuovo: svuotarlo a ogni modifica
    // faceva lampeggiare tutta la vista e richiudeva i lucchetti aperti.
    setError(null);
    void requestPreview(config, phase, stage)
      .then((info) => { if (active) setParts(info.parts ?? []); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [config, phase, stage]);

  if (error) return <p role="alert" className="text-sm text-editorial-danger">{error}</p>;
  if (!parts) return <p className="text-sm text-editorial-muted">{t('common.loading')}</p>;
  const byId = new Map(parts.map((part) => [`${part.message}:${part.id}`, part]));
  const group = (message: 'system' | 'user') => PHASE_PARTS[phase]
    .filter((spec) => spec.message === message)
    .map((spec) => <PartCard key={`${message}-${spec.id}`} spec={spec} part={byId.get(`${message}:${spec.id}`)} config={config} edit={edit} phase={phase} />);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel icon={FileText} label={t('pipeline.promptParts.systemMessage')} hint={t('pipeline.promptParts.systemMessageHint')} />
        {group('system')}
      </div>
      <div className="space-y-3">
        <SectionLabel icon={MessageSquare} label={t('pipeline.promptParts.userMessage')} hint={t('pipeline.promptParts.userMessageHint')} />
        {group('user')}
      </div>
    </div>
  );
}

function DeeplRequestPreview({ stage }: { stage: PipelineStageConfig }) {
  const { t } = useTranslation();
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setBody(null);
    setError(null);
    void deeplService.previewDeeplStage({ text: '{{SOURCE_CHUNK_TEXT}}', deeplConfig: getDeeplOptions(stage) })
      .then((value) => { if (active) setBody(value); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [stage]);

  if (error) return <p role="alert" className="text-sm text-editorial-danger">{error}</p>;
  if (body === null) return <p className="text-sm text-editorial-muted">{t('common.loading')}</p>;
  return <PromptMessage label={t('pipeline.promptParts.deepl-request.title')} hint={t('pipeline.promptParts.deepl-request.hint')} text={body}
    metadata={<><Hint label={t('pipeline.promptParts.kind.auto')}><Braces size={13} className="text-editorial-muted" aria-hidden="true" /></Hint><CommandRule /></>} />;
}

/** L'anteprima unica: per ogni fase i pezzi della richiesta, nell'ordine di invio, presi dal backend. */
export function PromptPreviewTab({ config, setConfig, onOpenSection, disabledReason }: PromptPreviewTabProps) {
  const { t } = useTranslation();
  const stages = useMemo(() => config.stages, [config.stages]);
  const firstEnabled = stages.find((stage) => stage.enabled)?.id ?? AUDIT_ID;
  const [activeId, setActiveId] = useState<string>(firstEnabled);
  const [mode, setMode] = useState<PreviewMode>('structure');
  const [systemTexts, setSystemTexts] = useState<Map<string, SystemTextInfo>>(new Map());
  useEffect(() => {
    let active = true;
    void llmService.systemTexts()
      .then((list) => { if (active) setSystemTexts(new Map(list.map((info) => [info.id, info]))); })
      .catch(() => { if (active) setSystemTexts(new Map()); });
    return () => { active = false; };
  }, []);
  const edit: EditContext = { setConfig, onOpenSection, systemTexts, disabledReason };
  // Il frammento aperto è quello che lo Studio mostra: il selezionato, altrimenti il primo.
  const selectedChunkId = useUiStore((s) => s.selectedChunkId);
  const chunks = useChunksStore((s) => s.chunks);
  const chunk = chunks.find((entry) => entry.id === selectedChunkId) ?? chunks[0] ?? null;

  useEffect(() => {
    const isReview = activeId === AUDIT_ID || activeId === COHERENCE_ID;
    if (!isReview && !stages.some((stage) => stage.id === activeId && stage.enabled)) setActiveId(firstEnabled);
  }, [activeId, stages, firstEnabled]);

  const tabs: TabStripItem[] = [
    ...stages.map((stage) => {
      const role = stage.role ?? 'translation';
      const Icon = STAGE_ICON[role];
      const label = t(`pipeline.stageRole.${role}`);
      return { id: stage.id, label: stage.enabled ? label : `${label} — ${t('pipeline.phaseNotUsed')}`, disabled: !stage.enabled, icon: <Icon size={14} /> };
    }),
    { id: AUDIT_ID, label: t('pipeline.auditPreviewLabel'), icon: <ShieldCheck size={14} /> },
    { id: COHERENCE_ID, label: t('pipeline.coherencePreviewLabel'), icon: <Link2 size={14} /> },
  ];
  // Scelta esclusiva fra due viste: cerchietti con icona, il nome nel suggerimento.
  const chunkLabel = t('pipeline.promptPreviewChunk');
  const modeOptions: ChoiceDotsOption<PreviewMode>[] = [
    { value: 'structure', label: t('pipeline.promptPreviewStructure'), content: <Braces size={11} /> },
    {
      value: 'chunk',
      label: chunk ? chunkLabel : t('transcription.commandBlocked', { command: chunkLabel, reason: t('pipeline.promptPreviewNoChunk') }),
      content: <ScrollText size={11} />,
      disabled: !chunk,
    },
  ];
  const activeLabel = tabs.find((tab) => tab.id === activeId)?.label ?? '';
  const stage = stages.find((entry) => entry.id === activeId);
  const phase: PreviewPhase | null = activeId === AUDIT_ID ? 'audit'
    : activeId === COHERENCE_ID ? 'coherence'
    : stage && stage.provider !== 'deepl' ? (stage.role === 'refine' || stage.role === 'format' ? stage.role : 'translation')
    : null;

  return (
    <PanelSection icon={FileText} label={t('pipeline.promptPreviewTitle')} hint={t('pipeline.promptPreviewHint')}>
      <div className="flex items-center gap-3">
        <TabStrip tabs={tabs} activeId={activeId} onChange={setActiveId} ariaLabel={t('pipeline.promptPreviewTitle')} idPrefix="prompt-preview" />
        <span className="font-display italic text-editorial-ink">{activeLabel}</span>
        <span className="ml-auto">
          <ChoiceDots options={modeOptions} value={mode} onChange={setMode} ariaLabel={t('pipeline.promptPreviewMode')} />
        </span>
      </div>
      <div id={`prompt-preview-panel-${activeId}`} role="tabpanel" aria-labelledby={`prompt-preview-tab-${activeId}`}>
        {mode === 'chunk'
          ? chunk
            ? <ChunkParts key={`${activeId}-${chunk.id}`} config={config} phase={phase} previewId={activeId} chunk={chunk} />
            : <p className="text-sm text-editorial-muted">{t('pipeline.promptPreviewNoChunk')}</p>
          : phase
            ? <PhaseParts key={activeId} config={config} phase={phase} stage={stage} edit={edit} />
            : stage ? <DeeplRequestPreview stage={stage} /> : null}
      </div>
    </PanelSection>
  );
}
