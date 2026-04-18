import { useState, useEffect } from 'react';
import { Key, CheckCircle2, Save, Loader2 } from 'lucide-react';
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

  if (editing) {
    return (
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase text-editorial-muted">{label}</span>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder="Paste API key..."
            className="flex-1 bg-editorial-textbox border-none px-3 py-2 text-[10px] font-mono outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={saving || !keyValue.trim()}
            className="p-1.5 text-editorial-ink hover:text-editorial-accent disabled:opacity-30"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold uppercase text-editorial-muted">{label}</span>
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-3 bg-editorial-textbox px-3 py-2 w-full text-left hover:bg-editorial-textbox/80 transition-colors"
      >
        <Key size={14} className={isConfigured ? 'text-editorial-accent' : 'text-editorial-muted opacity-20'} />
        <span className="flex-1 text-[10px] font-mono truncate">
          {isConfigured ? '••••••••••••••••' : 'Click to configure'}
        </span>
        {isConfigured && <CheckCircle2 size={12} className="text-editorial-ink" />}
      </button>
    </div>
  );
}
