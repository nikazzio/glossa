import { useState, useEffect } from 'react';
import { Key, CheckCircle2, Save, Loader2, Trash2, Shield, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { settingsService } from '../../services/llmService';
import { FieldLabel, FIELD_MONO_CLASSNAME, IconButton } from '../ui';

interface ApiKeyInputProps {
  label: string;
  provider: string;
  onKeyChange?: () => void;
}

export function ApiKeyInput({ label, provider, onKeyChange }: ApiKeyInputProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    settingsService.isKeyConfigured(provider)
      .then((configured) => { if (!cancelled) setIsConfigured(configured); })
      .catch(() => { if (!cancelled) setIsConfigured(false); });
    return () => { cancelled = true; };
  }, [provider]);

  const handleSave = async () => {
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      const storage = await settingsService.saveApiKey(provider, keyValue.trim());
      setIsConfigured(true);
      setKeyValue('');
      setEditing(false);
      onKeyChange?.();
      if (storage === 'file') {
        toast.warning(t('settings.keySavedFallback', { provider: label }));
      } else {
        toast.success(t('settings.keySaved', { provider: label }));
      }
    } catch (err: unknown) {
      toast.error(t('settings.keySaveFailed', { provider: label }), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await settingsService.deleteApiKey(provider);
      setIsConfigured(false);
      onKeyChange?.();
      toast.success(t('settings.keyDeleted', { provider: label }));
    } catch (err: unknown) {
      toast.error(t('settings.keyDeleteFailed', { provider: label }), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const fieldId = `settings-api-key-${provider}`;

  if (editing) {
    return (
      <div className="space-y-1.5">
        <FieldLabel htmlFor={fieldId} block>{label}</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            id={fieldId}
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={t('settings.pasteApiKey')}
            className={FIELD_MONO_CLASSNAME}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setEditing(false); setKeyValue(''); }
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (modifica chiave)
            autoFocus
          />
          {/* Comandi a icona come nel resto della finestra: erano gli unici
              pulsanti disegnati a mano, senza bordo e senza tono. */}
          <IconButton
            size="sm"
            onClick={handleSave}
            disabled={saving || !keyValue.trim()}
            title={t('settings.save')}
            className="shrink-0"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => { setEditing(false); setKeyValue(''); }}
            title={t('settings.cancel')}
            className="shrink-0"
          >
            <X size={13} />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <FieldLabel>{label}</FieldLabel>
        {isConfigured && <Shield size={10} className="text-editorial-success" />}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          // Il pulsante apre la modifica, non salva: l'etichetta deve dire
          // quello che succede premendolo.
          aria-label={isConfigured ? t('settings.editKey') : t('settings.clickToConfigure')}
          className="flex flex-1 items-center gap-3 rounded-md border border-editorial-border bg-editorial-textbox px-3 py-2 text-left transition-colors hover:border-editorial-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Key
            size={14}
            className={isConfigured ? 'text-editorial-accent' : 'text-editorial-muted opacity-40'}
          />
          <span className="flex-1 truncate font-mono text-sm text-editorial-ink">
            {isConfigured ? '••••••••••••••••' : t('settings.clickToConfigure')}
          </span>
          {isConfigured && <CheckCircle2 size={13} className="text-editorial-success" />}
        </button>
        {isConfigured && (
          <IconButton
            size="sm"
            tone="danger"
            onClick={handleDelete}
            title={t('settings.removeFromKeychain')}
            className="shrink-0"
          >
            <Trash2 size={13} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
