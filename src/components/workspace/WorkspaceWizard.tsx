import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { EmbeddingModel } from '../../types';

export function WorkspaceWizard() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState<EmbeddingModel>('text-embedding-3-small');
  const [loading, setLoading] = useState(false);
  const createAndActivate = useWorkspaceStore((s) => s.createAndActivate);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createAndActivate({
        name: name.trim(),
        description: description.trim() || undefined,
        embeddingModel: model,
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent';

  return (
    <div className="flex min-h-dvh min-h-[var(--app-min-height)] min-w-[var(--app-min-width)] flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold text-editorial-ink">
          Crea il tuo primo workspace
        </h1>
        <p className="max-w-md text-center text-sm text-editorial-muted">
          Un workspace raggruppa i tuoi libri e condivide la phrase memory tra di essi.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <input
          className={inputClass}
          placeholder="Nome workspace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        <input
          className={inputClass}
          placeholder="Descrizione (opzionale)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="px-1 text-xs text-editorial-muted">Modello di embedding</label>
          <select
            className={inputClass}
            value={model}
            onChange={(e) => setModel(e.target.value as EmbeddingModel)}
          >
            <option value="text-embedding-3-small">
              text-embedding-3-small — testi nella stessa lingua
            </option>
            <option value="text-embedding-3-large">
              text-embedding-3-large — lingue diverse (es. italiano antico → inglese)
            </option>
          </select>
          {model === 'text-embedding-3-small' && (
            <p className="px-1 text-xs text-editorial-accent">
              Per tradurre tra lingue diverse usa text-embedding-3-large per risultati migliori.
            </p>
          )}
        </div>

        <button
          type="button"
          className="rounded-full bg-editorial-ink px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
          onClick={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? 'Creazione...' : 'Crea workspace'}
        </button>
      </div>
    </div>
  );
}
