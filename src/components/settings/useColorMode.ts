import { useUiStore } from '../../stores/uiStore';

/** Il tema effettivo: quello scelto, o quello del sistema se la scelta è «Sistema». */
export function useColorMode(): 'light' | 'dark' {
  const colorScheme = useUiStore((s) => s.colorScheme);
  if (colorScheme !== 'system') return colorScheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
