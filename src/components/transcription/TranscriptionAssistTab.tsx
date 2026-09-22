import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Loader2, Lock, LockOpen, ScanText, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuditPromptEditor } from '../pipeline/AuditPromptEditor';
import { FieldLabel, IconButton, Select, Tooltip } from '../ui';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { getVisionCapableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useConfigStore } from '../../stores/configStore';
import { DEFAULT_OCR_PROMPT } from '../../constants';
import {
  resolveOcrSettings,
  type TranscriptionDocument,
  type TranscriptionSegment,
} from '../../services/transcriptionService';
import { ocrUnavailableReason, type OcrUnavailableReason } from '../../services/ocrService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { ModelProvider, PromptTemplate, Workspace } from '../../types';

const UNAVAILABLE_REASON_KEYS: Record<OcrUnavailableReason, string> = {
  noDigitization: 'transcription.assist.noDigitization',
  noModelConfigured: 'transcription.assist.noModelConfigured',
};

interface TranscriptionAssistTabProps {
  document: TranscriptionDocument | null;
  segment: TranscriptionSegment | null;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'> | null;
  viewerRef: ViewerVersionRef | null;
  starting: boolean;
  onStartOcr: () => void;
  onDocumentProviderChange: (provider: ModelProvider | '', model: string) => void;
  onDocumentModelChange: (model: string) => void;
  onDocumentPromptChange: (prompt: string) => void;
  onSegmentPromptChange: (prompt: string) => void;
}

/** Scheda Assistenza dello Studio di trascrizione (#220): select provider e
 *  modello a livello documento, editor del prompt a livello documento e
 *  pagina, comando di lettura per la pagina aperta. */
export function TranscriptionAssistTab({
  document,
  segment,
  workspace,
  viewerRef,
  starting,
  onStartOcr,
  onDocumentProviderChange,
  onDocumentModelChange,
  onDocumentPromptChange,
  onSegmentPromptChange,
}: TranscriptionAssistTabProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { templates, isLoaded, loadTemplates } = usePromptTemplateStore();
  const saveTemplate = usePromptTemplateStore((s) => s.saveTemplate);
  const deleteTemplate = usePromptTemplateStore((s) => s.deleteTemplate);
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const [isRefiningDocument, setIsRefiningDocument] = useState(false);
  const [isRefiningSegment, setIsRefiningSegment] = useState(false);

  useEffect(() => {
    if (!isLoaded) void loadTemplates();
  }, [isLoaded, loadTemplates]);

  if (!document || !workspace) {
    return (
      <p className="px-4 py-6 text-center text-xs text-editorial-muted">
        {t('transcription.assist.loading')}
      </p>
    );
  }

  const documentProvider = (document.ocr_provider ?? '') as ModelProvider | '';
  const documentModel = document.ocr_model ?? '';
  const resolved = resolveOcrSettings(segment, document, workspace);
  const ocrTemplates = templates.filter((tmpl) => tmpl.context === 'ocr');
  const canRefine = resolved.provider ? canRefineWithProvider(resolved.provider, keyStatuses) : false;
  const refineLabel = resolved.provider ? formatProviderModelLabel(resolved.provider, resolved.model) : '';
  const reason = ocrUnavailableReason(viewerRef, resolved.provider, resolved.model);

  const handleProviderChange = (nextProvider: ModelProvider | '') => {
    if (!nextProvider) {
      onDocumentProviderChange('', '');
      return;
    }
    const nextModels = getVisionCapableModelIds(nextProvider, ollamaModels);
    onDocumentProviderChange(nextProvider, nextModels[0] ?? '');
  };

  const handleRefineDocument = async () => {
    if (!resolved.provider || !document.ocr_prompt?.trim()) return;
    setIsRefiningDocument(true);
    try {
      const refined = await llmService.refinePrompt(document.ocr_prompt, resolved.provider, resolved.model, 'ocr');
      onDocumentPromptChange(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefiningDocument(false);
    }
  };

  const handleRefineSegment = async () => {
    if (!resolved.provider || !segment?.ocr_prompt?.trim()) return;
    setIsRefiningSegment(true);
    try {
      const refined = await llmService.refinePrompt(segment.ocr_prompt, resolved.provider, resolved.model, 'ocr');
      onSegmentPromptChange(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefiningSegment(false);
    }
  };

  // Bloccato per default: la select mostra il valore ereditato dal workspace
  // (sola lettura). Sbloccare crea un override a livello documento; ribloccare
  // lo cancella — tornare a ereditare è la stessa azione al contrario.
  const [overridden, setOverridden] = useState(Boolean(documentProvider));
  const effectiveProvider = overridden ? documentProvider : resolved.provider;
  const effectiveModel = overridden ? documentModel : resolved.model;
  const unlockedModelOptions = effectiveProvider ? getVisionCapableModelIds(effectiveProvider, ollamaModels) : [];

  const toggleOverride = () => {
    if (overridden) {
      setOverridden(false);
      onDocumentProviderChange('', '');
    } else {
      setOverridden(true);
    }
  };

  const providerOptions = [
    // Segnaposto disabilitato, mai scelto a mano: senza, un valore vuoto
    // farebbe apparire selezionata la prima voce vera, mentendo su cosa è
    // davvero impostato quando nessun livello ha ancora un provider.
    ...(effectiveProvider === '' ? [{ value: '', label: t('transcription.assist.noProvider'), disabled: true }] : []),
    ...LLM_PROVIDER_ORDER.map((entry) => ({
      value: entry,
      label: entry,
      disabled: entry !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[entry] === false,
    })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <div className="space-y-3 border-y border-editorial-border/70 py-4">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel icon={<Cpu size={11} className="shrink-0 text-editorial-accent" />}>
            {t('transcription.assist.documentModel')}
          </FieldLabel>
          <div className="flex items-center gap-1.5">
            <Tooltip label={reason ? t(UNAVAILABLE_REASON_KEYS[reason]) : t('transcription.assist.ready')}>
              {reason ? (
                <TriangleAlert size={14} className="shrink-0 text-editorial-warning" aria-hidden="true" />
              ) : (
                <CheckCircle2 size={14} className="shrink-0 text-editorial-success" aria-hidden="true" />
              )}
            </Tooltip>
            <IconButton
              size="sm"
              tone="accent"
              onClick={onStartOcr}
              disabled={starting || reason !== null}
              title={reason ? t(UNAVAILABLE_REASON_KEYS[reason]) : t('transcription.assist.readThisPage')}
            >
              {starting ? <Loader2 size={16} className="animate-spin" /> : <ScanText size={16} />}
            </IconButton>
          </div>
        </div>
        <div className="flex gap-2">
          <Select
            value={effectiveProvider}
            onChange={(value) => handleProviderChange(value as ModelProvider | '')}
            disabled={!overridden}
            className="w-28 shrink-0 font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={providerOptions}
          />
          {unlockedModelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={effectiveModel}
                onChange={onDocumentModelChange}
                disabled={!overridden}
                className="flex-1 font-mono"
                ariaLabel={t('transcription.assist.documentModel')}
                options={unlockedModelOptions.map((entry) => ({ value: entry, label: entry }))}
              />
              {effectiveProvider && (
                <ModelCapabilityHint provider={effectiveProvider} model={effectiveModel} iconOnly />
              )}
            </div>
          ) : (
            <input
              value={effectiveModel}
              onChange={(e) => onDocumentModelChange(e.target.value)}
              disabled={!overridden}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('transcription.assist.documentModel')}
            />
          )}
          <IconButton
            size="sm"
            tone={overridden ? 'accent' : 'default'}
            onClick={toggleOverride}
            title={overridden ? t('transcription.assist.inheritWorkspace') : t('transcription.assist.customizeForDocument')}
            ariaPressed={overridden}
            className="shrink-0"
          >
            {overridden ? <LockOpen size={13} /> : <Lock size={13} />}
          </IconButton>
        </div>
      </div>

      <AuditPromptEditor
        label={t('transcription.assist.documentPrompt')}
        hint=""
        value={document.ocr_prompt ?? ''}
        placeholder={workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT}
        templates={ocrTemplates}
        isRefining={isRefiningDocument}
        canRefine={canRefine}
        refineLabel={refineLabel}
        onRefine={() => void handleRefineDocument()}
        onChange={onDocumentPromptChange}
        onApplyTemplate={(template: PromptTemplate) => onDocumentPromptChange(template.prompt)}
        saveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        defaultModel={resolved.model}
        defaultProvider={resolved.provider}
        defaultValue={workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT}
        onReset={() => onDocumentPromptChange('')}
        templateContext="ocr"
        templateWorkflow="transcription"
      />

      {segment && (
        <AuditPromptEditor
          label={t('transcription.assist.pagePrompt')}
          hint=""
          value={segment.ocr_prompt ?? ''}
          placeholder={document.ocr_prompt || workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT}
          templates={ocrTemplates}
          isRefining={isRefiningSegment}
          canRefine={canRefine}
          refineLabel={refineLabel}
          onRefine={() => void handleRefineSegment()}
          onChange={onSegmentPromptChange}
          onApplyTemplate={(template: PromptTemplate) => onSegmentPromptChange(template.prompt)}
          saveTemplate={saveTemplate}
          onDeleteTemplate={deleteTemplate}
          defaultModel={resolved.model}
          defaultProvider={resolved.provider}
          defaultValue={document.ocr_prompt || workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT}
          onReset={() => onSegmentPromptChange('')}
          templateContext="ocr"
          templateWorkflow="transcription"
        />
      )}
    </div>
  );
}
