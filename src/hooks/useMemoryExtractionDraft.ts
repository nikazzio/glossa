import { useCallback } from 'react';
import { usePhraseMemoryDraftStore } from '../stores/phraseMemoryDraftStore';
import type { PhraseCandidateDraft } from '../stores/phraseMemoryDraftStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { extractPhraseMemoryPairs, saveApprovedPhrasePairs } from '../services/phraseMemoryService';
import { generateId } from '../utils';
import type { TranslationChunk } from '../types';

export function useMemoryExtractionDraft(chunk: TranslationChunk | null) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const sourceLanguage = usePipelineStore((s) => s.config.sourceLanguage);
  const targetLanguage = usePipelineStore((s) => s.config.targetLanguage);
  const entry = usePhraseMemoryDraftStore((s) => (chunk ? s.draftsByChunk.get(chunk.id) : undefined));

  const status = entry?.status ?? 'idle';
  const candidates = entry?.candidates ?? [];
  const canExtract = Boolean(chunk?.translationLocked) && status !== 'extracting' && status !== 'saving';

  const extract = useCallback(async () => {
    if (!chunk || !activeWorkspace) return;
    const { setDraftStatus, setDraftCandidates } = usePhraseMemoryDraftStore.getState();
    setDraftStatus(chunk.id, 'extracting');
    try {
      const pairs = await extractPhraseMemoryPairs({
        provider: activeWorkspace.memoryExtractorProvider,
        model: activeWorkspace.memoryExtractorModel,
        prompt: activeWorkspace.memoryExtractorPrompt,
        sourceText: chunk.sourceProcessingText,
        targetText: chunk.translationProcessingText,
        sourceLanguage,
        targetLanguage,
        chunkId: chunk.id,
      });
      const draftCandidates: PhraseCandidateDraft[] = pairs.map((pair) => ({
        id: generateId('pmcand'),
        sourcePhrase: pair.sourcePhrase,
        targetPhrase: pair.targetPhrase,
        confidence: pair.confidence,
        origin: 'ai',
        accepted: true,
      }));
      setDraftCandidates(chunk.id, draftCandidates);
    } catch (err) {
      setDraftStatus(chunk.id, 'error');
      throw err;
    }
  }, [chunk, activeWorkspace, sourceLanguage, targetLanguage]);

  const addManualCandidate = useCallback(() => {
    if (!chunk) return;
    usePhraseMemoryDraftStore.getState().addManualCandidate(chunk.id);
  }, [chunk]);

  const updateCandidate = useCallback(
    (candidateId: string, changes: Partial<Pick<PhraseCandidateDraft, 'sourcePhrase' | 'targetPhrase'>>) => {
      if (!chunk) return;
      usePhraseMemoryDraftStore.getState().updateCandidate(chunk.id, candidateId, changes);
    },
    [chunk],
  );

  const toggleAccepted = useCallback((candidateId: string) => {
    if (!chunk) return;
    usePhraseMemoryDraftStore.getState().toggleAccepted(chunk.id, candidateId);
  }, [chunk]);

  const removeCandidate = useCallback((candidateId: string) => {
    if (!chunk) return;
    usePhraseMemoryDraftStore.getState().removeCandidate(chunk.id, candidateId);
  }, [chunk]);

  const confirm = useCallback(async (): Promise<number> => {
    if (!chunk || !activeWorkspace || !currentProjectId) return 0;
    const accepted = candidates.filter(
      (c) => c.accepted && c.sourcePhrase.trim() && c.targetPhrase.trim(),
    );
    if (accepted.length === 0) return 0;

    const { setDraftStatus, clearDraft } = usePhraseMemoryDraftStore.getState();
    setDraftStatus(chunk.id, 'saving');
    try {
      const savedCount = await saveApprovedPhrasePairs({
        workspaceId: activeWorkspace.id,
        projectId: currentProjectId,
        chunkId: chunk.id,
        embeddingModel: activeWorkspace.embeddingModel,
        sourceLanguage,
        targetLanguage,
        pairs: accepted.map((c) => ({
          sourcePhrase: c.sourcePhrase,
          targetPhrase: c.targetPhrase,
          confidence: c.confidence,
        })),
      });
      clearDraft(chunk.id);
      return savedCount;
    } catch (err) {
      setDraftStatus(chunk.id, 'error');
      throw err;
    }
  }, [chunk, activeWorkspace, currentProjectId, candidates, sourceLanguage, targetLanguage]);

  return {
    status,
    candidates,
    canExtract,
    extract,
    addManualCandidate,
    updateCandidate,
    toggleAccepted,
    removeCandidate,
    confirm,
  };
}
