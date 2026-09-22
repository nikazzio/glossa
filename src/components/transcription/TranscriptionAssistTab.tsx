import { useEffect, useState } from 'react';
import { AlertCircle, Cpu, Loader2, ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuditPromptEditor } from '../pipeline/AuditPromptEditor';
import { FieldLabel, IconButton, Select } from '../ui';
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
  noSourcePage: 'transcription.assist.noSourcePage',
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
  const reason = ocrUnavailableReason(viewerRef, segment, resolved.provider, resolved.model);

  const modelOptions = documentProvider ? getVisionCapableModelIds(documentProvider, ollamaModels) : [];

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

  const providerOptions = [
    { value: '', label: t('transcription.assist.inheritWorkspace') },
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
        <div className="flex gap-2">
          <Select
            value={documentProvider}
            onChange={(value) => handleProviderChange(value as ModelProvider | '')}
            className="font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={providerOptions}
          />
          {documentProvider && modelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={documentModel}
                onChange={onDocumentModelChange}
                className="flex-1 font-mono"
                ariaLabel={t('transcription.assist.documentModel')}
                options={modelOptions.map((entry) => ({ value: entry, label: entry }))}
              />
              <ModelCapabilityHint provider={documentProvider} model={documentModel} iconOnly />
            </div>
          ) : documentProvider ? (
            <input
              value={documentModel}
              onChange={(e) => onDocumentModelChange(e.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('transcription.assist.documentModel')}
            />
          ) : (
            <p className="flex flex-1 items-center px-2 text-xs text-editorial-muted">
              {resolved.provider
                ? t('transcription.assist.inheritedFromWorkspace', { provider: resolved.provider, model: resolved.model })
                : t('transcription.assist.noProviderHint')}
            </p>
          )}
        </div>
        {reason && (
          <p className="flex items-start gap-1.5 text-xs text-editorial-muted">
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t(UNAVAILABLE_REASON_KEYS[reason])}
          </p>
        )}
      </div>

      <AuditPromptEditor
        label={t('transcription.assist.documentPrompt')}
        hint={t('transcription.assist.documentPromptHint')}
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
          hint={t('transcription.assist.pagePromptHint')}
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
