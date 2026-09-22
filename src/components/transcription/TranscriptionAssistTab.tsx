import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Loader2, Lock, LockOpen, ScanText, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuditPromptEditor } from '../pipeline/AuditPromptEditor';
import { FieldLabel, IconButton, Select, Tooltip } from '../ui';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { getVisionCapableModelIds, LLM_PROVIDER_ORDER, providerSupportsVision } from '../../models/catalog';
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
  pageLabel: string;
  starting: boolean;
  reading: boolean;
  onStartOcr: () => void;
  onDocumentProviderChange: (provider: ModelProvider | '', model: string) => void;
  onDocumentModelChange: (model: string) => void;
  onPagePromptChange: (prompt: string) => void;
}

/** Scheda OCR dello Studio di trascrizione (#220): fornitore e modello per il
 *  documento, il prompt **della pagina aperta** — uno solo, non una cascata di
 *  editor uguali — e il comando di lettura. */
export function TranscriptionAssistTab({
  document,
  segment,
  workspace,
  viewerRef,
  pageLabel,
  starting,
  reading,
  onStartOcr,
  onDocumentProviderChange,
  onDocumentModelChange,
  onPagePromptChange,
}: TranscriptionAssistTabProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { templates, isLoaded, loadTemplates } = usePromptTemplateStore();
  const saveTemplate = usePromptTemplateStore((s) => s.saveTemplate);
  const deleteTemplate = usePromptTemplateStore((s) => s.deleteTemplate);
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const [isRefining, setIsRefining] = useState(false);
  // Bloccato per default: la select mostra il valore ereditato dal workspace
  // (sola lettura). Sbloccare crea una scelta a livello documento; ribloccare
  // la cancella — tornare a ereditare è la stessa azione al contrario.
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    if (!isLoaded) void loadTemplates();
  }, [isLoaded, loadTemplates]);

  // La scelta del documento arriva dopo il primo disegno (lettura dal
  // database): il lucchetto la segue, senza che uno stato iniziale
  // fotografato una volta sola resti indietro al cambio di documento.
  const documentProvider = (document?.ocr_provider ?? '') as ModelProvider | '';
  useEffect(() => {
    setOverridden(Boolean(documentProvider));
  }, [documentProvider, document?.id]);

  const handleRefine = async (resolvedProvider: ModelProvider | '', resolvedModel: string, prompt: string) => {
    if (!resolvedProvider || !prompt.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(prompt, resolvedProvider, resolvedModel, 'ocr');
      onPagePromptChange(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefining(false);
    }
  };

  if (!document || !workspace) {
    return (
      <p className="px-4 py-6 text-center text-xs text-editorial-muted">
        {t('transcription.assist.loading')}
      </p>
    );
  }

  const documentModel = document.ocr_model ?? '';
  const resolved = resolveOcrSettings(segment, document, workspace);
  const ocrTemplates = templates.filter((tmpl) => tmpl.context === 'ocr');
  const canRefine = resolved.provider ? canRefineWithProvider(resolved.provider, keyStatuses) : false;
  const refineLabel = resolved.provider ? formatProviderModelLabel(resolved.provider, resolved.model) : '';
  const reason = ocrUnavailableReason(viewerRef, resolved.provider, resolved.model);

  const effectiveProvider = overridden ? documentProvider : resolved.provider;
  const effectiveModel = overridden ? documentModel : resolved.model;
  const unlockedModelOptions = effectiveProvider ? getVisionCapableModelIds(effectiveProvider, ollamaModels) : [];
  const defaultPrompt = workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT;

  const handleProviderChange = (nextProvider: ModelProvider | '') => {
    if (!nextProvider) {
      onDocumentProviderChange('', '');
      return;
    }
    const nextModels = getVisionCapableModelIds(nextProvider, ollamaModels);
    onDocumentProviderChange(nextProvider, nextModels[0] ?? '');
  };

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
      // Senza chiave, o senza nemmeno un modello che legga immagini, quel
      // fornitore non può servire una lettura: si mostra spento invece di
      // portare a una chiamata che fallisce.
      disabled:
        (entry !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[entry] === false) ||
        !providerSupportsVision(entry, ollamaModels),
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
              disabled={starting || reading || reason !== null}
              title={
                reading
                  ? t('transcription.assist.readingThisPage', { page: pageLabel })
                  : reason
                    ? t(UNAVAILABLE_REASON_KEYS[reason])
                    : t('transcription.assist.readThisPage')
              }
            >
              {starting || reading ? <Loader2 size={16} className="animate-spin" /> : <ScanText size={16} />}
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
            // Solo Ollama arriva qui: la lista dei modelli locali è dinamica e
            // nessun elenco statico può dire quali leggono immagini.
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

      {/* Un prompt solo, quello della pagina aperta. Quello che scrivi qui
          vale per questa pagina e non tocca le altre. */}
      <AuditPromptEditor
        label={t('transcription.assist.pagePrompt', { page: pageLabel })}
        hint={t('transcription.assist.pagePromptHint')}
        value={segment?.ocr_prompt ?? ''}
        placeholder={defaultPrompt}
        templates={ocrTemplates}
        isRefining={isRefining}
        canRefine={canRefine}
        refineLabel={refineLabel}
        onRefine={() => void handleRefine(resolved.provider, resolved.model, segment?.ocr_prompt || defaultPrompt)}
        onChange={onPagePromptChange}
        onApplyTemplate={(template: PromptTemplate) => onPagePromptChange(template.prompt)}
        saveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        defaultModel={resolved.model}
        defaultProvider={resolved.provider}
        defaultValue={defaultPrompt}
        onReset={() => onPagePromptChange('')}
        templateContext="ocr"
        templateWorkflow="transcription"
      />
    </div>
  );
}
