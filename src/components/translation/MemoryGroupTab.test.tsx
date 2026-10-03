import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTranslationChunk } from '../../test/chunkFactory';
import { MemoryGroupTab } from './MemoryGroupTab';

vi.mock('../document/tabs/ReferencesTab', () => ({ ReferencesTab: () => <div>similar-phrases</div> }));
vi.mock('../document/tabs/MemoryTab', () => ({ MemoryTab: () => <div>extract-phrases</div> }));

describe('MemoryGroupTab', () => {
  it('opens on the similar phrases and keeps extraction off until the chunk is translated', () => {
    render(
      <MemoryGroupTab panelId="m" labelledBy="m-tab" view="memory" onViewChange={vi.fn()} currentChunk={makeTranslationChunk({ id: 'c1' })} />,
    );

    expect(screen.getByText('similar-phrases')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /memory\.extractButton/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tab', { name: /memory\.extractButton/ })).toHaveAccessibleName(
      'memory.extractButton — memory.reasonNotVerified',
    );
  });

  it('shows the extraction once the translation is verified', () => {
    render(
      <MemoryGroupTab
        panelId="m"
        labelledBy="m-tab"
        view="memory"
        onViewChange={vi.fn()}
        currentChunk={makeTranslationChunk({ id: 'c1', status: 'completed', translationLocked: true })}
      />,
    );

    expect(screen.getByText('extract-phrases')).toBeInTheDocument();
  });
});
