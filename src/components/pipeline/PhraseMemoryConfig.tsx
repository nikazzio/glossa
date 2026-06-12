import { Brain, RefreshCcw, Search } from 'lucide-react';
import { SectionLabel, ToggleRow } from '../ui';

interface PhraseMemoryConfigValue {
  usePhraseMemory: boolean;
  autoSearchPhraseMemory: boolean;
  phraseMemoryMaxResults: number;
}

interface PhraseMemoryConfigProps extends PhraseMemoryConfigValue {
  onChange: (value: PhraseMemoryConfigValue) => void;
  disabled?: boolean;
}

const DEFAULT_MAX_RESULTS = 10;

export function PhraseMemoryConfig({
  usePhraseMemory,
  autoSearchPhraseMemory,
  phraseMemoryMaxResults,
  onChange,
  disabled = false,
}: PhraseMemoryConfigProps) {
  const effectiveMaxResults = Number.isFinite(phraseMemoryMaxResults)
    ? phraseMemoryMaxResults
    : DEFAULT_MAX_RESULTS;

  const emit = (patch: Partial<PhraseMemoryConfigValue>) =>
    onChange({
      usePhraseMemory,
      autoSearchPhraseMemory,
      phraseMemoryMaxResults: effectiveMaxResults,
      ...patch,
    });

  return (
    <div className="space-y-3">
      <SectionLabel icon={Brain} label="Phrase Memory" />

      <div className="space-y-3 rounded-[16px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-4">
        <ToggleRow
          icon={<Brain size={13} />}
          label="Memory"
          checked={usePhraseMemory}
          disabled={disabled}
          onChange={() => emit({ usePhraseMemory: !usePhraseMemory })}
        />

        {usePhraseMemory && (
          <>
            <ToggleRow
              icon={<Search size={13} />}
              label="Auto-search"
              checked={autoSearchPhraseMemory}
              disabled={disabled}
              onChange={() => emit({ autoSearchPhraseMemory: !autoSearchPhraseMemory })}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="pm-max-results"
                className="block text-xs font-sans uppercase tracking-[0.22em] text-editorial-muted"
              >
                Max results
              </label>
              <input
                id="pm-max-results"
                type="number"
                min={1}
                max={50}
                value={effectiveMaxResults}
                onChange={(e) =>
                  emit({ phraseMemoryMaxResults: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                disabled={disabled}
                className="w-32 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
              />
            </div>

            {!autoSearchPhraseMemory && (
              <div className="flex items-center gap-2 rounded-[14px] border border-editorial-border/50 bg-editorial-bg/60 px-3 py-2 text-xs leading-relaxed text-editorial-muted">
                <RefreshCcw size={13} className="shrink-0 text-editorial-accent" />
                <span>Manual refresh remains available in the chunk Memory panel.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

