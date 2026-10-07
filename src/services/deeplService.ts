import { invoke } from '@tauri-apps/api/core';
import type { DeeplConfig, DeeplLanguageInfo } from '../types';

interface DeeplStageParams {
  text: string;
  deeplConfig: DeeplConfig;
}

interface DeeplStageResult {
  content: string;
  billedCharacters?: number;
  detectedSourceLanguage?: string;
}

async function runDeeplStage(params: DeeplStageParams): Promise<DeeplStageResult> {
  return invoke<DeeplStageResult>('run_deepl_stage', {
    input: {
      text: params.text,
      deeplConfig: params.deeplConfig,
    },
  });
}

/** Exact API body, assembled by the same backend function used for execution. */
async function previewDeeplStage(params: DeeplStageParams): Promise<string> {
  const body = await invoke<Record<string, unknown>>('preview_deepl_stage', { input: params });
  return JSON.stringify(body, null, 2);
}

async function getLanguages(langType: 'source' | 'target'): Promise<DeeplLanguageInfo[]> {
  return invoke<DeeplLanguageInfo[]>('get_deepl_languages', { langType });
}

export interface DeeplGlossaryInfo {
  glossaryId: string;
  name: string;
  ready: boolean;
  sourceLang: string;
  targetLang: string;
  entryCount: number;
  creationTime: string;
}

interface CreateGlossaryParams {
  name: string;
  sourceLang: string;
  targetLang: string;
  entries: Array<{ source: string; target: string }>;
}

async function listGlossaries(): Promise<DeeplGlossaryInfo[]> {
  return invoke<DeeplGlossaryInfo[]>('list_deepl_glossaries');
}

async function createGlossary(params: CreateGlossaryParams): Promise<DeeplGlossaryInfo> {
  return invoke<DeeplGlossaryInfo>('create_deepl_glossary', { input: params });
}

async function deleteGlossary(glossaryId: string): Promise<void> {
  return invoke<void>('delete_deepl_glossary', { glossaryId });
}

export const deeplService = { runDeeplStage, previewDeeplStage, getLanguages, listGlossaries, createGlossary, deleteGlossary };
