import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToLuminance } from './contrastRatio';

describe('hexToLuminance', () => {
  it('returns 0 for black', () => {
    expect(hexToLuminance('#000000')).toBe(0);
  });

  it('returns 1 for white', () => {
    expect(hexToLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('returns 0 for an invalid/short hex', () => {
    expect(hexToLuminance('#fff')).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('returns 21:1 for black on white (max WCAG contrast)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for identical colors', () => {
    expect(contrastRatio('#2F746C', '#2F746C')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio('#2F746C', '#F8F5F0')).toBeCloseTo(contrastRatio('#F8F5F0', '#2F746C'), 5);
  });
});
