import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemLogTab } from './SystemLogTab';
import { readAppLog, type LogLine } from '../../services/appLogService';
import { useUiStore } from '../../stores/uiStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../services/appLogService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/appLogService')>()),
  readAppLog: vi.fn(),
}));

const line = (timestamp: string, message: string): LogLine => ({
  timestamp,
  target: 'federation',
  level: 'INFO',
  message,
  fromApp: true,
});

/** Lascia finire le letture in volo, compresa quella del timer. */
const settle = () => act(async () => { await Promise.resolve(); });

describe('SystemLogTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiStore.setState({ systemLogHighlightData: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(readAppLog).mockReset();
  });

  it('le righe nuove arrivano da sole, senza ricaricare a mano', async () => {
    vi.mocked(readAppLog).mockResolvedValue([line('2026-09-26 20:59:00', 'prima')]);
    render(<SystemLogTab panelId="p" labelledBy="l" />);
    await settle();
    expect(screen.getByText('prima')).toBeInTheDocument();

    vi.mocked(readAppLog).mockResolvedValue([
      line('2026-09-26 20:59:03', 'seconda'),
      line('2026-09-26 20:59:00', 'prima'),
    ]);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByText('seconda')).toBeInTheDocument();
  });

  it('le righe caricate a mano restano quando arriva una riga nuova', async () => {
    const page = Array.from({ length: 200 }, (_, index) =>
      line(`2026-09-26 20:${String(58 - Math.floor(index / 60)).padStart(2, '0')}:${String(59 - (index % 60)).padStart(2, '0')}`, `riga ${index}`));
    vi.mocked(readAppLog).mockResolvedValueOnce(page).mockResolvedValueOnce([line('2026-09-26 19:00:00', 'più vecchia')]);
    render(<SystemLogTab panelId="p" labelledBy="l" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'systemLog.loadMore' }));
    await settle();
    expect(screen.getByText('più vecchia')).toBeInTheDocument();

    vi.mocked(readAppLog).mockResolvedValue([line('2026-09-26 21:00:00', 'appena arrivata'), ...page.slice(0, 199)]);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByText('appena arrivata')).toBeInTheDocument();
    expect(screen.getByText('più vecchia')).toBeInTheDocument();
  });

  it('svuotare la vista nasconde le righe presenti ma lascia arrivare le nuove', async () => {
    vi.mocked(readAppLog).mockResolvedValue([line('2026-09-26 20:59:00', 'vecchia')]);
    render(<SystemLogTab panelId="p" labelledBy="l" />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'systemLog.clearView' }));
    expect(screen.queryByText('vecchia')).not.toBeInTheDocument();

    vi.mocked(readAppLog).mockResolvedValue([
      line('2026-09-26 20:59:05', 'nuova'),
      line('2026-09-26 20:59:00', 'vecchia'),
    ]);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByText('nuova')).toBeInTheDocument();
    expect(screen.queryByText('vecchia')).not.toBeInTheDocument();
  });

  it('i dati si colorano come in un editor, e il comando spegne i colori', async () => {
    vi.mocked(readAppLog).mockResolvedValue([line('2026-09-26 20:59:00', 'evento {"page":1}')]);
    render(<SystemLogTab panelId="p" labelledBy="l" />);
    await settle();

    expect(screen.getByText('"page"')).toHaveClass('text-terminal-info');

    fireEvent.click(screen.getByRole('button', { name: 'systemLog.highlightData' }));

    expect(screen.queryByText('"page"')).not.toBeInTheDocument();
    expect(screen.getByText('evento {"page":1}')).toBeInTheDocument();
    expect(useUiStore.getState().systemLogHighlightData).toBe(false);
  });
});
