import { useEffect, useState } from 'react';
import { Cpu, Lock, LockOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuditPromptEditor } from '../pipeline/AuditPromptEditor';
import { IconButton, SectionLabel, Select } from '../ui';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { getVisionCapableModelIds, LLM_PROVIDER_ORDER, providerSupportsVision } from '../../models/catalog';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useConfigStore } from '../../stores/configStore';
import { DEFAULT_OCR_PROMPT } from '../../constants';
import { resolveOcrSettings, type TranscriptionDocument } from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { OcrImageMode, OcrImagePreferences } from '../../services/ocrImageSettingsService';
import type { ModelProvider, PromptTemplate, Workspace } from '../../types';
import { OcrImageModePicker } from './OcrImageModePicker';
import { OcrStartButton } from './OcrStartButton';

interface TranscriptionAssistTabProps {
  document: TranscriptionDocument | null;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'> | null;
  viewerRef: ViewerVersionRef | null;
  pageLabel: string;
  starting: boolean;
  reading: boolean;
  onStartOcr: () => void;
  onDocumentProviderChange: (provider: ModelProvider | '', model: string) => void;
  onDocumentModelChange: (model: string) => void;
  /** `null` torna al prompt di partenza del workspace. */
  onDocumentPromptChange: (prompt: string | null) => void;
  image: OcrImagePreferences;
  onImageModeChange: (mode: OcrImageMode) => void;
}

/** Scheda OCR dello Studio di trascrizione (#220): fornitore, modello e
 *  prompt del documento, e il comando di lettura della pagina aperta. Stessa
 *  resa della scheda traduzione: due sezioni, pochissime scritte. */
export function TranscriptionAssistTab({
  document,
  workspace,
  viewerRef,
  pageLabel,
  starting,
  reading,
  onStartOcr,
  onDocumentProviderChange,
  onDocumentModelChange,
  onDocumentPromptChange,
  image,
  onImageModeChange,
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
      onDocumentPromptChange(refined);
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
  const resolved = resolveOcrSettings(document, workspace);
  const ocrTemplates = templates.filter((tmpl) => tmpl.context === 'ocr');
  const canRefine = resolved.provider ? canRefineWithProvider(resolved.provider, keyStatuses) : false;
  const refineLabel = resolved.provider ? formatProviderModelLabel(resolved.provider, resolved.model) : '';

  const effectiveProvider = overridden ? documentProvider : resolved.provider;
  const effectiveModel = overridden ? documentModel : resolved.model;
  const unlockedModelOptions = effectiveProvider ? getVisionCapableModelIds(effectiveProvider, ollamaModels) : [];
  const defaultPrompt = workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT;
  // Testo uguale al prompt di partenza = nessuna scelta del documento: il
  // documento torna a seguire il workspace invece di congelarne una copia.
  const handlePromptChange = (prompt: string) => {
    onDocumentPromptChange(prompt.trim() === defaultPrompt.trim() ? null : prompt);
  };

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
      <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel icon={Cpu} label={t('transcription.assist.documentModel')} />
          <OcrStartButton
            document={document}
            workspace={workspace}
            viewerRef={viewerRef}
            pageLabel={pageLabel}
            starting={starting}
            reading={reading}
            onStart={onStartOcr}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={effectiveProvider}
            onChange={(value) => handleProviderChange(value as ModelProvider | '')}
            disabled={!overridden}
            className="font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={providerOptions}
          />
          {unlockedModelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={effectiveModel}
                onChange={onDocumentModelChange}
                disabled={!overridden}
                className="flex-1"
                ariaLabel={t('transcription.assist.documentModel')}
                options={unlockedModelOptions.map((entry) => ({ value: entry, label: entry }))}
              />
              {effectiveProvider && (
                <>
                  <ModelCapabilityHint provider={effectiveProvider} model={effectiveModel} iconOnly />
                  <DeprecatedModelBadge provider={effectiveProvider} model={effectiveModel} />
                </>
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
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
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
        <OcrImageModePicker value={image.mode} edge={image.edge} onChange={onImageModeChange} />
      </div>

      {/* Il prompt del documento: modificato da una pagina qualsiasi vale per
          tutte le sue pagine, e per nessun altro documento. */}
      <AuditPromptEditor
        variant="stage"
        label={t('transcription.assist.documentPrompt')}
        hint=""
        value={resolved.prompt}
        placeholder={defaultPrompt}
        templates={ocrTemplates}
        isRefining={isRefining}
        canRefine={canRefine}
        refineLabel={refineLabel}
        onRefine={() => void handleRefine(resolved.provider, resolved.model, resolved.prompt)}
        onChange={handlePromptChange}
        onApplyTemplate={(template: PromptTemplate) => handlePromptChange(template.prompt)}
        saveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        defaultModel={resolved.model}
        defaultProvider={resolved.provider}
        defaultValue={defaultPrompt}
        onReset={() => onDocumentPromptChange(null)}
        templateContext="ocr"
        templateWorkflow="transcription"
      />
    </div>
  );
}
