import { describe, expect, it } from 'vitest';
import { locationsEqual, translationsLocation, withWorkspaceFilter } from './appLocation';

describe('withWorkspaceFilter', () => {
  it('applies a workspace filter to a global area', () => {
    const result = withWorkspaceFilter(translationsLocation(), 'ws-1');
    expect(result).toEqual({ area: 'translations', workspaceFilter: 'ws-1' });
  });

  it('removes the filter entirely (no leftover undefined key) when passed null', () => {
    const filtered = withWorkspaceFilter(translationsLocation(), 'ws-1');
    const cleared = withWorkspaceFilter(filtered, null);
    expect(cleared).toEqual({ area: 'translations' });
    expect('workspaceFilter' in cleared).toBe(false);
  });

  it('is a no-op on a non-global-area location', () => {
    const dashboard = { area: 'dashboard' } as const;
    expect(withWorkspaceFilter(dashboard, 'ws-1')).toBe(dashboard);
  });
});

describe('locationsEqual', () => {
  it('treats two locations with the same shape and values as equal', () => {
    expect(locationsEqual({ area: 'translations' }, { area: 'translations' })).toBe(true);
    expect(
      locationsEqual(
        { area: 'translations', workspaceFilter: 'ws-1' },
        { area: 'translations', workspaceFilter: 'ws-1' },
      ),
    ).toBe(true);
  });

  it('treats a filtered and an unfiltered location as different', () => {
    expect(
      locationsEqual({ area: 'translations' }, { area: 'translations', workspaceFilter: 'ws-1' }),
    ).toBe(false);
  });

  it('treats different areas as different', () => {
    expect(locationsEqual({ area: 'dashboard' }, { area: 'translations' })).toBe(false);
  });
});
