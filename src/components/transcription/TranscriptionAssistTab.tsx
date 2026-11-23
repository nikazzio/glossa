import { useEffect, useState } from 'react';
import { Cpu, FilePen, ImageIcon, HardDrive, Shrink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChoiceDots, IconButton, PANEL_BODY_CLASSNAME, PanelSection, Select, Spinner } from '../ui';
import { canRefineWithProvider, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { getVisionCapableModelIds, LLM_PROVIDER_ORDER, providerSupportsVision } from '../../models/catalog';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { useConfigStore } from '../../stores/configStore';
import { DEFAULT_OCR_PROMPT } from '../../constants';
import { resolveOcrSettings, type TranscriptionDocument } from '../../services/transcriptionService';
import type { OcrImageMode, OcrImagePreferences } from '../../services/ocrImageSettingsService';
import type { ModelProvider, Workspace } from '../../types';
import { PromptPanel } from '../prompt/PromptPanel';
import { FIELD_MONO_CLASSNAME } from '../ui/fieldStyles';

interface TranscriptionAssistTabProps {
  document: TranscriptionDocument | null;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'> | null;
  onDocumentProviderChange: (provider: ModelProvider | '', model: string) => void;
  onDocumentModelChange: (model: string) => void;
  /** `null` torna al prompt di partenza del workspace. */
  onDocumentPromptChange: (prompt: string | null) => void;
  /** Bozza del prompt tenuta dallo Studio: resta cambiando scheda. */
  promptDraft: string | null;
  onPromptDraftChange: (draft: string | null) => void;
  image: OcrImagePreferences;
  onImageModeChange: (mode: OcrImageMode) => void;
}

/** Scheda OCR dello Studio di trascrizione (#220): servizio, modello e prompt
 *  del documento, e l'immagine inviata. Il comando di lettura sta sopra le
 *  schede. */
export function TranscriptionAssistTab({
  document,
  workspace,
  onDocumentProviderChange,
  onDocumentModelChange,
  onDocumentPromptChange,
  promptDraft,
  onPromptDraftChange,
  image,
  onImageModeChange,
}: TranscriptionAssistTabProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { statuses: keyStatuses } = useProviderKeyStatus();
  // Spento per default: le scelte mostrano il valore del workspace. Acceso
  // crea una scelta del documento; spento di nuovo la cancella.
  const [overridden, setOverridden] = useState(false);

  // La scelta del documento arriva dopo il primo disegno (lettura dal
  // database): il comando la segue anche al cambio di documento.
  const documentProvider = (document?.ocr_provider ?? '') as ModelProvider | '';
  useEffect(() => {
    setOverridden(Boolean(documentProvider));
  }, [documentProvider, document?.id]);

  if (!document || !workspace) {
    return (
      <div className={PANEL_BODY_CLASSNAME}>
        <Spinner label={t('transcription.assist.loading')} />
      </div>
    );
  }

  const documentModel = document.ocr_model ?? '';
  const resolved = resolveOcrSettings(document, workspace);
  const canRefine = resolved.provider ? canRefineWithProvider(resolved.provider, keyStatuses) : false;

  const effectiveProvider = overridden ? documentProvider : resolved.provider;
  const effectiveModel = overridden ? documentModel : resolved.model;
  const unlockedModelOptions = effectiveProvider ? getVisionCapableModelIds(effectiveProvider, ollamaModels) : [];
  const defaultPrompt = workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT;
  // Testo uguale al prompt di partenza = nessuna scelta del documento: il
  // documento torna a seguire il workspace invece di congelarne una copia.
  const handlePromptSave = (prompt: string) => {
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

  const imageOptions = [
    { value: 'optimized' as const, label: t('transcription.assist.imageOptimized', { edge: image.edge }), content: <Shrink size={11} /> },
    { value: 'local' as const, label: t('transcription.assist.imageLocal'), content: <HardDrive size={11} /> },
  ];

  return (
    <div className={PANEL_BODY_CLASSNAME}>
      <PanelSection
        icon={Cpu}
        label={t('transcription.assist.documentModel')}
        actions={
          <IconButton
            size="sm"
            tone={overridden ? 'accent' : 'default'}
            onClick={toggleOverride}
            title={overridden ? t('transcription.assist.inheritWorkspace') : t('transcription.assist.customizeForDocument')}
            ariaPressed={overridden}
          >
            <FilePen size={13} />
          </IconButton>
        }
      >
        <div className="space-y-1">
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
                className={`${FIELD_MONO_CLASSNAME} min-w-0 flex-1 py-1`}
                aria-label={t('transcription.assist.documentModel')}
              />
            )}
          </div>
          <p className="text-xs text-editorial-muted">
            {t(overridden ? 'transcription.assist.modelFromDocument' : 'transcription.assist.modelFromWorkspace')}
          </p>
        </div>
      </PanelSection>

      {/* Il prompt del documento: salvato da una pagina qualsiasi vale per
          tutte le sue pagine, e per nessun altro documento. */}
      <PromptPanel
        label={t('transcription.assist.documentPrompt')}
        value={resolved.prompt}
        defaultValue={defaultPrompt}
        onSave={handlePromptSave}
        templateContext="ocr"
        templateWorkflow="transcription"
        refine={resolved.provider ? {
          provider: resolved.provider,
          model: resolved.model,
          blockedReason: canRefine ? null : t('transcription.assist.refineNeedsKey'),
        } : undefined}
        draft={promptDraft}
        onDraftChange={onPromptDraftChange}
      />

      <PanelSection
        icon={ImageIcon}
        label={t('transcription.assist.image')}
        hint={t('transcription.assist.imageModeHint')}
        actions={
          <ChoiceDots
            options={imageOptions}
            value={image.mode}
            onChange={onImageModeChange}
            ariaLabel={t('transcription.assist.image')}
            tooltipSide="left"
          />
        }
      >
        {null}
      </PanelSection>
    </div>
  );
}
