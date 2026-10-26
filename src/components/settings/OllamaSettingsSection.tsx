import { useState } from 'react';
import { Boxes, RefreshCw, Server, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ollamaService } from '../../services/llmService';
import { useConfigStore } from '../../stores/configStore';
import { errorMessage, logger } from '../../utils/logger';
import { FIELD_MONO_CLASSNAME, FieldLabel, IconButton, PanelSection, SECTION_SETTING_LIST_CLASSNAME, ToggleRow, Tooltip } from '../ui';

const DOT_CLASS = { connected: 'bg-editorial-success', disconnected: 'bg-editorial-danger', unchecked: 'bg-editorial-running' } as const;

/** Ollama in locale: indirizzo del server, stato della connessione e modelli trovati. */
export function OllamaSettingsSection() {
  const { t } = useTranslation();
  const {
    ollamaStatus, ollamaModels, setOllamaModels, setOllamaStatus,
    ollamaBaseUrl, setOllamaBaseUrl, ollamaAutoDiscover, setOllamaAutoDiscover,
  } = useConfigStore();
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const statusKey = ollamaStatus === 'connected' || ollamaStatus === 'disconnected' ? ollamaStatus : 'unchecked';
  const statusLabel = statusKey === 'connected'
    ? t('ollama.connected', { count: ollamaModels.length })
    : t(`ollama.${statusKey}`);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
      setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (error: unknown) {
      logger.warn('settings.ollama.refresh_failed', { message: errorMessage(error) });
      setOllamaModels([]);
      setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'));
    } finally {
      setRefreshing(false);
    }
  };

  const commitUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setUrlError(t('ollama.urlInvalid'));
      return;
    }
    setUrlError(null);
    setOllamaBaseUrl(trimmed);
    void refresh();
  };

  return (
    <>
      <PanelSection icon={Server} label={t('settings.models.server')}>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="settings-ollama-url" block>{t('ollama.baseUrl')}</FieldLabel>
          <div className="flex items-center gap-2">
            <input id="settings-ollama-url" type="url" value={urlDraft} placeholder="http://localhost:11434"
              onChange={(event) => { setUrlDraft(event.target.value); setUrlError(null); }}
              onBlur={commitUrl} className={FIELD_MONO_CLASSNAME} />
            <Tooltip label={statusLabel}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[statusKey]}`} aria-label={statusLabel} />
            </Tooltip>
            <IconButton onClick={() => void refresh()} disabled={refreshing} title={t('ollama.refresh')} size="sm" className="shrink-0">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </IconButton>
          </div>
          {urlError && <p role="alert" className="text-sm text-editorial-danger">{urlError}</p>}
        </div>
      </PanelSection>
      <PanelSection icon={Boxes} label={t('settings.models.list')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <div className="py-2.5">
            <ToggleRow icon={<Zap size={13} />} label={t('ollama.autoDiscover')} checked={ollamaAutoDiscover}
              onChange={() => setOllamaAutoDiscover(!ollamaAutoDiscover)} />
          </div>
          {ollamaModels.map((modelId) => (
            <div key={modelId} className="py-2.5"><span className="font-mono text-sm text-editorial-ink">{modelId}</span></div>
          ))}
        </div>
      </PanelSection>
    </>
  );
}
