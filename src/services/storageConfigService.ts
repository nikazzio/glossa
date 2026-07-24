import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export interface DataDirStatus {
  path: string;
  isOverride: boolean;
}

export async function getDataDir(): Promise<DataDirStatus> {
  return invoke<DataDirStatus>('get_data_dir');
}

export async function setDataDir(newPath: string): Promise<void> {
  await invoke('set_data_dir', { newPath });
}

/** Opens a native folder picker; returns null if the user cancels. */
export async function pickDataDirFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}
