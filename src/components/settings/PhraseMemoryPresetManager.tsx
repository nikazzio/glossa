import { useCallback, useEffect, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  clonePreset,
  createCustomPreset,
  deleteCustomPreset,
  listPresets,
  updateCustomPreset,
} from '../../services/phraseMemoryPresetService';
import type { PhraseMemoryPreset, PhraseMemoryPresetConfig } from '../../types';
import { IconButton } from '../ui';
import { PresetForm } from './PresetForm';

const DEFAULT_CONFIG: PhraseMemoryPresetConfig = {
  splitter: 'regex',
  similarityThreshold: 0.75,
  maxResults: 10,
  minPhraseLength: 3,
};

type FormMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; preset: PhraseMemoryPreset };

export function PhraseMemoryPresetManager() {
  const [presets, setPresets] = useState<PhraseMemoryPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed' });

  const reload = useCallback(async () => {
    try {
      const data = await listPresets();
      setPresets(data);
    } catch (err: unknown) {
      toast.error('Errore caricamento preset', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const handleClone = async (preset: PhraseMemoryPreset) => {
    try {
      await clonePreset(preset.id);
      await reload();
      toast.success(`"${preset.name}" clonato`);
    } catch (err: unknown) {
      toast.error('Clonazione fallita', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDelete = async (preset: PhraseMemoryPreset) => {
    try {
      await deleteCustomPreset(preset.id);
      await reload();
      toast.success(`"${preset.name}" eliminato`);
    } catch (err: unknown) {
      toast.error('Eliminazione fallita', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCreate = async (name: string, config: PhraseMemoryPresetConfig) => {
    try {
      await createCustomPreset(name, config);
      setFormMode({ type: 'closed' });
      await reload();
      toast.success(`Preset "${name}" creato`);
    } catch (err: unknown) {
      toast.error('Creazione fallita', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleEdit = async (name: string, config: PhraseMemoryPresetConfig) => {
    if (formMode.type !== 'edit') return;
    try {
      await updateCustomPreset(formMode.preset.id, name, config);
      setFormMode({ type: 'closed' });
      await reload();
      toast.success(`Preset "${name}" aggiornato`);
    } catch (err: unknown) {
      toast.error('Aggiornamento fallito', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-xs text-editorial-muted italic">Caricamento…</p>
      ) : (
        <div className="space-y-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between gap-3 rounded-[18px] border border-editorial-border bg-editorial-bg/60 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-display italic text-editorial-ink">
                  {preset.name}
                </span>
                {preset.isBuiltin && (
                  <span className="shrink-0 rounded-full border border-editorial-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.25em] text-editorial-muted">
                    Built-in
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {preset.isBuiltin ? (
                  <IconButton
                    size="sm"
                    title="Clona e personalizza"
                    onClick={() => handleClone(preset)}
                    aria-label="clona"
                  >
                    <Copy size={13} />
                  </IconButton>
                ) : (
                  <>
                    <IconButton
                      size="sm"
                      title="Modifica"
                      onClick={() => setFormMode({ type: 'edit', preset })}
                      aria-label="modifica"
                    >
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      tone="accent"
                      title="Elimina"
                      onClick={() => handleDelete(preset)}
                      aria-label="elimina"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formMode.type !== 'closed' && (
        <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/20 px-5 py-5">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {formMode.type === 'create' ? 'Nuovo preset' : 'Modifica preset'}
          </p>
          <PresetForm
            initialName={formMode.type === 'edit' ? formMode.preset.name : ''}
            initialConfig={formMode.type === 'edit' ? formMode.preset.config : DEFAULT_CONFIG}
            onSubmit={formMode.type === 'create' ? handleCreate : handleEdit}
            onCancel={() => setFormMode({ type: 'closed' })}
          />
        </div>
      )}

      {formMode.type === 'closed' && (
        <button
          type="button"
          onClick={() => setFormMode({ type: 'create' })}
          className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:border-editorial-accent/50 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label="nuovo preset"
        >
          <Plus size={13} />
          Nuovo preset
        </button>
      )}
    </div>
  );
}
