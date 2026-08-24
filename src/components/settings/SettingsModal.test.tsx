import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';
import { useUiStore } from '../../stores/uiStore';

// La finestra pesca da parecchi servizi: qui interessa la barra delle linguette,
// non cosa c'è dentro le schede.
vi.mock('../../services/llmService', () => ({
  settingsService: { isKeyConfigured: vi.fn(async () => false) },
  ollamaService: { listModels: vi.fn(async () => []) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

describe('barra delle linguette delle impostazioni', () => {
  beforeEach(() => {
    // jsdom non ha `matchMedia`: la finestra la interroga per sapere se il tema
    // di sistema è scuro.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    useUiStore.setState({ showSettings: true, settingsTab: 'translations' });
  });

  it('le frecce cambiano scheda, e Home ed End vanno agli estremi', async () => {
    // Le linguette inattive stanno fuori dal percorso di tabulazione: senza le
    // frecce, con la tastiera si arrivava solo a quella già aperta.
    const user = userEvent.setup();
    render(<SettingsModal />);

    const first = screen.getByRole('tab', { name: 'areas.translations.title' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'settings.typographyTab' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'settings.librariesTab' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'areas.translations.title' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('le schede che arriveranno con la 2.0 lo dicono in una frase tradotta', () => {
    render(<SettingsModal />);

    // Due: Biblioteca e Trascrizioni. Il tooltip viene da una chiave tradotta,
    // non da una frase scritta nel codice.
    const planned = screen.getAllByRole('button', { name: 'settings.tabPlanned' });
    expect(planned).toHaveLength(2);
    planned.forEach((tab) => expect(tab).toBeDisabled());
  });
});
