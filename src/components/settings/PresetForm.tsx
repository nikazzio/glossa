import { useState } from 'react';
import type { PhraseMemoryPresetConfig, PhraseMemorySplitter } from '../../types';

interface PresetFormProps {
  initialName: string;
  initialConfig: PhraseMemoryPresetConfig;
  onSubmit: (name: string, config: PhraseMemoryPresetConfig) => void;
  onCancel: () => void;
}

const SPLITTER_OPTIONS: Array<{ value: PhraseMemorySplitter; label: string }> = [
  { value: 'regex', label: 'Regex' },
  { value: 'llm',   label: 'LLM' },
  { value: 'none',  label: 'Nessuno' },
];

export function PresetForm({ initialName, initialConfig, onSubmit, onCancel }: PresetFormProps) {
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [config, setConfig] = useState<PhraseMemoryPresetConfig>(initialConfig);

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError('Nome obbligatorio');
      return;
    }
    onSubmit(name.trim(), config);
  };

  const update = <K extends keyof PhraseMemoryPresetConfig>(
    key: K,
    value: PhraseMemoryPresetConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="preset-name"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Nome
        </label>
        <input
          id="preset-name"
          type="text"
          value={name}
          aria-label="nome"
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(null);
          }}
          className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          placeholder="Es. Terminologia tecnica"
        />
        {nameError && (
          <p className="text-xs text-editorial-accent">{nameError}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
          Splitter frasi
        </p>
        <div className="flex gap-3">
          {SPLITTER_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="splitter"
                value={value}
                checked={config.splitter === value}
                onChange={() => update('splitter', value)}
                aria-label={label}
                className="accent-editorial-accent"
              />
              <span className="text-sm text-editorial-ink">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="preset-threshold"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Soglia similarità — {config.similarityThreshold.toFixed(2)}
        </label>
        <input
          id="preset-threshold"
          type="range"
          min="0.5"
          max="1"
          step="0.01"
          value={config.similarityThreshold}
          onChange={(e) => update('similarityThreshold', parseFloat(e.target.value))}
          className="w-full accent-editorial-accent"
        />
        <div className="flex justify-between text-[10px] text-editorial-muted">
          <span>0.50</span>
          <span>1.00</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="preset-max-results"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Risultati massimi
        </label>
        <input
          id="preset-max-results"
          type="number"
          min={1}
          max={50}
          value={config.maxResults}
          onChange={(e) => update('maxResults', Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="preset-min-length"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Lunghezza minima frase (caratteri)
        </label>
        <input
          id="preset-min-length"
          type="number"
          min={1}
          value={config.minPhraseLength}
          onChange={(e) => update('minPhraseLength', Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-full bg-editorial-ink px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          Salva
        </button>
      </div>
    </div>
  );
}
