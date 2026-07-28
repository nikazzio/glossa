export const WORKSPACE_ICON_KEYS = [
  'manuscript',
  'book',
  'quill',
  'archive',
  'library',
  'lens',
  'seal',
  'bookmark',
  'feather',
  'hourglass',
  'leaf',
  'anchor',
  'siren',
  'scrollQuill',
] as const;

export type WorkspaceIconKey = typeof WORKSPACE_ICON_KEYS[number];

export const DEFAULT_WORKSPACE_ICON: WorkspaceIconKey = 'book';

export function isWorkspaceIconKey(value: string | null | undefined): value is WorkspaceIconKey {
  return WORKSPACE_ICON_KEYS.includes(value as WorkspaceIconKey);
}
