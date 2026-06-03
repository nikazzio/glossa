import { useCallback, useEffect, useState } from 'react';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { listPresets } from '../../services/phraseMemoryPresetService';
import type { PhraseMemoryOverrides, PhraseMemoryPreset, PhraseMemorySplitter } from '../../types';
import { SectionLabel } from '../ui';

interface PhraseMemoryConfigValue {
  usePhraseMemory: boolean;
  phraseMemoryPresetId: string | null;
  phraseMemoryOverrides: PhraseMemoryOverrides | null;
}

interface PhraseMemoryConfigProps {
  usePhraseMemory: boolean;
  presetId: string | null;
  overrides: PhraseMemoryOverrides | null;
  onChange: (value: PhraseMemoryConfigValue) => void;
  disabled?: boolean;
}

const SPLITTER_LABELS: Record<PhraseMemorySplitter, string> = {
  regex: 'Regex',
  llm: 'LLM',
  none: 'Nessuno',
};

export function PhraseMemoryConfig({
  usePhraseMemory,
  presetId,
  overrides,
  onChange,
  disabled = false,
}: PhraseMemoryConfigProps) {
  const [presets, setPresets] = useState<PhraseMemoryPreset[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedPreset = presets.find((p) => p.id === presetId) ?? presets[0] ?? null;
  const hasOverrides = overrides !== null && Object.keys(overrides).length > 0;

  const load = useCallback(async () => {
    try {
      const data = await listPresets();
      setPresets(data);
    } catch (err: unknown) {
      toast.error('Errore caricamento preset', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const emit = (patch: Partial<PhraseMemoryConfigValue>) =>
    onChange({
      usePhraseMemory,
      phraseMemoryPresetId: presetId,
      phraseMemoryOverrides: overrides,
      ...patch,
    });

  const handleToggle = () =>
    emit({
      usePhraseMemory: !usePhraseMemory,
      ...(usePhraseMemory ? {} : { phraseMemoryPresetId: presetId ?? presets[0]?.id ?? null }),
    });

  const handlePresetChange = (id: string) =>
    emit({ phraseMemoryPresetId: id, phraseMemoryOverrides: null });

  const patchOverride = <K extends keyof PhraseMemoryOverrides>(
    key: K,
    value: PhraseMemoryOverrides[K],
  ) => {
    const next = { ...overrides, [key]: value };
    if (selectedPreset && selectedPreset.config[key] === value) {
      delete next[key];
    }
    const cleaned = Object.keys(next).length > 0 ? next : null;
    emit({ phraseMemoryOverrides: cleaned });
  };

  const effective = {
    splitter: overrides?.splitter ?? selectedPreset?.config.splitter ?? 'regex',
    similarityThreshold: overrides?.similarityThreshold ?? selectedPreset?.config.similarityThreshold ?? 0.75,
    maxResults: overrides?.maxResults ?? selectedPreset?.config.maxResults ?? 10,
    minPhraseLength: overrides?.minPhraseLength ?? selectedPreset?.config.minPhraseLength ?? 3,
  };

  return (
    <div className="space-y-3">
      <SectionLabel icon={Brain} label="Phrase Memory" />

      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={usePhraseMemory}
          disabled={disabled}
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${usePhraseMemory ? 'bg-editorial-accent' : 'bg-editorial-border'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${usePhraseMemory ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
        <span className="text-xs text-editorial-muted">
          {usePhraseMemory ? 'Attiva' : 'Non attiva'}
        </span>
      </div>

      {usePhraseMemory && (
        <div className="space-y-3 rounded-[16px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-4">
          <div className="space-y-1.5">
            <label
              htmlFor="phrase-memory-preset"
              className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
            >
              Preset
            </label>
            <select
              id="phrase-memory-preset"
              value={selectedPreset?.id ?? ''}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={disabled || presets.length === 0}
              className="w-full appearance-none rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.isBuiltin ? ' (built-in)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-expanded={showAdvanced}
              aria-label="avanzate"
            >
              {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              Avanzate
              {hasOverrides && (
                <span className="ml-1 rounded-full bg-editorial-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-editorial-accent">
                  modificato
                </span>
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                    Splitter frasi
                  </p>
                  <div className="flex gap-3">
                    {(['regex', 'llm', 'none'] as PhraseMemorySplitter[]).map((v) => (
                      <label key={v} className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name={`pm-splitter-${presetId}`}
                          value={v}
                          checked={effective.splitter === v}
                          onChange={() => patchOverride('splitter', v)}
                          disabled={disabled}
                          className="accent-editorial-accent"
                        />
                        <span className="text-xs text-editorial-ink">{SPLITTER_LABELS[v]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="pm-threshold"
                    aria-label="soglia similarità"
                    className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
                  >
                    Soglia similarità — {effective.similarityThreshold.toFixed(2)}
                    {overrides?.similarityThreshold !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </label>
                  <input
                    id="pm-threshold"
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.01"
                    value={effective.similarityThreshold}
                    onChange={(e) => patchOverride('similarityThreshold', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="w-full accent-editorial-accent disabled:opacity-40"
                    aria-label="soglia similarità"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="pm-max-results"
                    className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
                  >
                    Risultati massimi
                    {overrides?.maxResults !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </label>
                  <input
                    id="pm-max-results"
                    type="number"
                    min={1}
                    max={50}
                    value={effective.maxResults}
                    onChange={(e) =>
                      patchOverride('maxResults', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    disabled={disabled}
                    className="w-32 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="pm-min-length"
                    className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
                  >
                    Lunghezza minima frase
                    {overrides?.minPhraseLength !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </label>
                  <input
                    id="pm-min-length"
                    type="number"
                    min={1}
                    value={effective.minPhraseLength}
                    onChange={(e) =>
                      patchOverride('minPhraseLength', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    disabled={disabled}
                    className="w-32 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
