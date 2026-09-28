import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkIdentity, imprint } from './WorkIdentity';

describe('imprint', () => {
  it('unisce luogo e tipografo', () => {
    expect(imprint('Lyon', 'François Juste')).toBe('Lyon, François Juste');
  });

  it('non ripete il luogo già scritto dentro il tipografo', () => {
    expect(imprint('Lyon', 'Lyon : F. Juste')).toBe('Lyon : F. Juste');
  });

  it('usa quello che c\'è quando manca uno dei due', () => {
    expect(imprint(null, 'F. Juste')).toBe('F. Juste');
    expect(imprint('Lyon', null)).toBe('Lyon');
    expect(imprint(null, null)).toBeNull();
  });
});

describe('WorkIdentity', () => {
  it('mette l\'autore in evidenza prima di anno, luogo e titolo', () => {
    render(
      <WorkIdentity
        work={{ title: 'Pantagruel', creator: 'Rabelais', date: '1542', place: 'Lyon', publisher: 'F. Juste' }}
      />,
    );
    expect(screen.getByText('Rabelais').tagName).toBe('STRONG');
    expect(screen.getByText('· 1542 · Lyon, F. Juste', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Pantagruel')).toBeInTheDocument();
  });

  it('senza autore, anno e luogo mostra solo il titolo', () => {
    const { container } = render(
      <WorkIdentity work={{ title: 'Anonimo', creator: null, date: null, place: null, publisher: null }} />,
    );
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.getByText('Anonimo')).toBeInTheDocument();
  });
});
