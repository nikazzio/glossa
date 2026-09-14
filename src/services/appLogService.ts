import { invoke } from '@tauri-apps/api/core';

/** I livelli scritti nel file dal plugin di log, nel loro ordine di gravità. */
export const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogLine {
  /** `YYYY-MM-DD HH:MM:SS`, come sta nel file. */
  timestamp: string;
  target: string;
  level: string;
  message: string;
  fromApp: boolean;
}

export interface LogQuery {
  limit: number;
  /** Righe già mostrate da saltare, per caricare il tratto precedente. */
  skip?: number;
  levels?: LogLevel[];
  query?: string;
  includeDependencies?: boolean;
  /** `null` significa tutte le origini del programma. */
  targetPrefixes?: string[] | null;
}

export async function readAppLog(query: LogQuery): Promise<LogLine[]> {
  return invoke<LogLine[]>('read_app_log', { query });
}
