import type { Dispatch, SetStateAction } from 'react';
import type { PipelineConfig } from '../../types';
import { FewShotExamplesConfig } from './FewShotExamplesConfig';
import { PhraseMemoryConfig } from './PhraseMemoryConfig';

const DEFAULT_PHRASE_MEMORY_MAX_RESULTS = 10;

interface MemoryTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  isProcessing: boolean;
}

/** Memoria delle frasi ed esempi di traduzione: entrano nel prompt delle fasi
 *  che leggono l'originale, quindi non esistono nella modalità DeepL. */
export function MemoryTabPanel({ config, setConfig, isProcessing }: MemoryTabPanelProps) {
  return (
    <div id="pconfig-panel-memory" role="tabpanel" aria-labelledby="pconfig-tab-memory" className="space-y-8">
      <PhraseMemoryConfig
        usePhraseMemory={config.usePhraseMemory ?? false}
        autoSearchPhraseMemory={config.autoSearchPhraseMemory !== false}
        phraseMemoryMaxResults={config.phraseMemoryMaxResults ?? DEFAULT_PHRASE_MEMORY_MAX_RESULTS}
        onChange={(memoryConfig) => setConfig((prev) => ({ ...prev, ...memoryConfig }))}
        disabled={isProcessing}
      />
      <FewShotExamplesConfig
        examples={config.fewShotExamples ?? []}
        onChange={(fewShotExamples) => setConfig((prev) => ({ ...prev, fewShotExamples }))}
        disabled={isProcessing}
      />
    </div>
  );
}
