import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogRow } from './TranscriptionLogTab';
import type { PersistedLogEntry } from '../../services/dbService';

const outcome = (overrides: Partial<PersistedLogEntry> = {}): PersistedLogEntry => ({
  id: 'e1', at: '2026-11-22T12:53:58.000Z', level: 'success', scope: 'ocr', phase: 'end',
  message: 'trascrizione salvata — revisione 2', provider: 'openai', model: 'gpt-5.6-terra',
  durationMs: 32_800, inputTokens: 4441, outputTokens: 2738, ...overrides,
});

describe('riga del log della trascrizione', () => {
  it('dice in parole servizio, durata, token inviati con quelli dalla cache, ricevuti e costo', () => {
    render(<LogRow entry={outcome({ cachedInputTokens: 1930 })} pricingOverrides={{}} />);
    const facts = screen.getByText(/OpenAI gpt-5.6-terra/).textContent ?? '';
    expect(facts).toContain('OpenAI gpt-5.6-terra · 32.8 s');
    expect(facts).toContain('transcription.log.sentTokensCached');
    expect(facts).toContain('transcription.log.receivedTokens');
    expect(facts).toMatch(/≈ \$0\.05$/);
  });

  it('senza cache usa la voce dei token inviati semplice', () => {
    render(<LogRow entry={outcome()} pricingOverrides={{}} />);
    const facts = screen.getByText(/OpenAI gpt-5.6-terra/).textContent ?? '';
    expect(facts).toContain('transcription.log.sentTokens');
    expect(facts).not.toContain('sentTokensCached');
  });

  it('una riga senza token né costo mostra solo servizio e durata', () => {
    render(<LogRow entry={outcome({ phase: 'start', inputTokens: undefined, outputTokens: undefined, provider: 'mystery', model: undefined, durationMs: 0 })} pricingOverrides={{}} />);
    const facts = screen.getByText(/mystery/).textContent ?? '';
    expect(facts).not.toContain('sentTokens');
    expect(facts).not.toContain('≈');
  });
});
