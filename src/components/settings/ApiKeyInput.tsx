import { useState, useEffect } from 'react';
import { Key, CheckCircle2, Save, Loader2, Trash2, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { settingsService } from '../../services/llmService';

interface ApiKeyInputProps {
  label: string;
  provider: string;
}

export function ApiKeyInput({ label, provider }: ApiKeyInputProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    settingsService.isKeyConfigured(provider)
      .then(setIsConfigured)
      .catch(() => setIsConfigured(false));
  }, [provider]);

  const handleSave = async () => {
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      await settingsService.saveApiKey(provider, keyValue.trim());
      setIsConfigured(true);
      setKeyValue('');
      setEditing(false);
    } catch (err) {
      console.error('Failed to save key:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await settingsService.deleteApiKey(provider);
      setIsConfigured(false);
    } catch (err) {
      console.error('Failed to delete key:', err);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase text-editorial-muted">{label}</span>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={t('settings.pasteApiKey')}
            className="flex-1 bg-editorial-textbox border-none px-3 py-2 text-[10px] font-mono outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setEditing(false); setKeyValue(''); }
            }}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving || !keyValue.trim()}
            className="p-1.5 text-editorial-ink hover:text-editorial-accent disabled:opacity-30"
            title={t('settings.save')}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
          <button
            onClick={() => { setEditing(false); setKeyValue(''); }}
            className="p-1.5 text-editorial-muted hover:text-editorial-ink text-[10px]"
          >
            {t('settings.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase text-editorial-muted">{label}</span>
        {isConfigured && <Shield size={10} className="text-editorial-accent" />}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-3 bg-editorial-textbox px-3 py-2 flex-1 text-left hover:bg-editorial-textbox/80 transition-colors"
        >
          <Key size={14} className={isConfigured ? 'text-editorial-accent' : 'text-editorial-muted opacity-20'} />
          <span className="flex-1 text-[10px] font-mono truncate">
            {isConfigured ? '••••••••••••••••' : t('settings.clickToConfigure')}
          </span>
          {isConfigured && <CheckCircle2 size={12} className="text-editorial-ink" />}
        </button>
        {isConfigured && (
          <button
            onClick={handleDelete}
            className="p-1.5 text-editorial-muted hover:text-red-500 transition-colors"
            title={t('settings.removeFromKeychain')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
